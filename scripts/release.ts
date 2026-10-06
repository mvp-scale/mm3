// `npm run release -- <nightly|ceremony|main>`: one release, one manifest (release.json), one command per stage, each ending in a receipt.
// A feature release is defined up front (title, version, the one PR that holds everything) and shipped as a unit. A stage prints what it will
// do in plain words, checks everything it can from GitHub, npm and the ledger before touching anything, asks once (or takes --yes), runs the
// steps in order, stops at the first problem, then re-reads GitHub and npm and says "out on nightly" only when each of the checks below holds.
// nightly: merge the PR, publish the nightly build, wait for npm, verify, write a receipt. ceremony: run the formal ceremony on the published
// nightly from a clean worktree and bring its record home. main: check the gate and print the owner's last commands (merge, tag, publish).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { append, chainProblem, lastFormal, nextId, readLedger, type LedgerRecord, type ReleaseRecord } from './agentic/ledger.ts';

export interface Manifest {
  version: string;
  title: string;
  prs: number[];
  accept: string[];
}

export interface Io {
  gh(args: string[]): string;
  git(args: string[]): string;
  npmTags(): Record<string, string>;
  sleep(ms: number): Promise<void>;
}

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

/** The manifest as a person wrote it, or the stops that say what to change. */
export function parseManifest(raw: unknown): { manifest?: Manifest; stops: string[] } {
  const stops: string[] = [];
  const m = (raw ?? {}) as Record<string, unknown>;
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(m.version)) stops.push('✖ version: must look like 0.1.3 → set the version this release will be');
  if (typeof m.title !== 'string' || m.title.trim() === '' || m.title.length > 100) stops.push('✖ title: one line of at most 100 characters → say what this release does for a user');
  if (!Array.isArray(m.prs) || m.prs.length === 0 || !m.prs.every((n) => Number.isInteger(n) && (n as number) > 0)) stops.push('✖ prs: a list of pull request numbers → list the one PR that holds this release');
  else if (m.prs.length > 1) stops.push('✖ prs: a release is one PR → put the work in one branch; side fixes join it until it merges');
  if (m.accept !== undefined && !(Array.isArray(m.accept) && m.accept.every((s) => typeof s === 'string'))) stops.push('✖ accept: a list of ceremony ids the owner accepted → for example ["CER-0007"], or leave it out');
  if (stops.length) return { stops };
  return { manifest: { version: m.version as string, title: (m.title as string).trim(), prs: m.prs as number[], accept: (m.accept as string[] | undefined) ?? [] }, stops };
}

/** What a stage will do, in plain words, before it does any of it. */
export function planText(stage: 'nightly' | 'ceremony' | 'main', m: Manifest): string[] {
  const head = [`RELEASE ${m.version} · ${m.title}`];
  if (stage === 'nightly') return [...head, `  1. merge PR #${m.prs.join(', #')} into nightly (the whole feature: code, CHANGELOG, version cues)`, '  2. publish the nightly build to npm and wait for it to appear', `  3. verify from GitHub and npm: nightly's head, ${m.version} on the branch and on the page, npm's nightly tag = that head, CI green`, '  4. write a receipt (REL-####) to test/agentic/ledger.jsonl'];
  if (stage === 'ceremony') return [...head, '  1. take the exact commit npm\'s nightly tag was built from, in a clean worktree with a real npm ci', '  2. run the formal ceremony on that published version (free path)', '  3. bring the record home into this checkout\'s ledger'];
  return [...head, '  1. check: a formal ceremony for this version passed (or its id is in "accept" in release.json), the ledger chain is intact, nightly is the tested code', '  2. print the owner\'s last commands: merge nightly into main, tag, publish latest. Nothing is merged or published by this stage.'];
}

const BAD = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

/** undefined when every check on a PR has finished and none failed; otherwise the one line that says why not. */
export function rollupProblem(rollup: Array<{ name?: string; status?: string; conclusion?: string }>): string | undefined {
  const pending = rollup.filter((c) => c.status !== undefined && c.status !== 'COMPLETED');
  if (pending.length) return `still running: ${pending.map((c) => c.name ?? '?').join(', ')} → wait for them`;
  const bad = rollup.filter((c) => BAD.has(c.conclusion ?? ''));
  if (bad.length) return `failed: ${bad.map((c) => c.name ?? '?').join(', ')} → fix it in the PR`;
  return rollup.length ? undefined : 'no checks reported → CI has not run on this PR';
}

const showJson = (io: Io, ref: string, file: string): string | undefined => {
  try {
    return io.git(['show', `${ref}:${file}`]);
  } catch {
    return undefined;
  }
};
const pkgVersion = (text: string | undefined): string | undefined => (text ? (JSON.parse(text) as { version?: string }).version : undefined);
const hasVersionHeading = (changelog: string | undefined, version: string): boolean => new RegExp(`^## Unreleased.*\\b${version.replaceAll('.', '\\.')}\\b`, 'mu').test(changelog ?? '');
const hasNpmBadge = (readme: string | undefined): boolean => /img\.shields\.io\/npm\/v\/@mvpscale\/mm3\/nightly/u.test(readme ?? '');

/** Everything checkable before anything is merged, read-only. One entry per check, so the plan can show each one. */
export function preflight(m: Manifest, io: Io, chain: string | undefined): Check[] {
  const out: Check[] = [{ id: 'ledger chain intact', ok: chain === undefined, detail: chain ?? 'ok' }];
  for (const n of m.prs) {
    const pr = JSON.parse(io.gh(['pr', 'view', String(n), '--json', 'state,baseRefName,statusCheckRollup,headRefOid'])) as { state: string; baseRefName: string; headRefOid: string; statusCheckRollup: Array<{ name?: string; status?: string; conclusion?: string }> };
    out.push({ id: `PR #${n} is open and targets nightly`, ok: pr.state === 'OPEN' && pr.baseRefName === 'nightly', detail: `${pr.state}, base ${pr.baseRefName}` });
    const roll = rollupProblem(pr.statusCheckRollup ?? []);
    out.push({ id: `PR #${n} checks are green`, ok: roll === undefined, detail: roll ?? `${(pr.statusCheckRollup ?? []).length} checks passed or skipped` });
    io.git(['fetch', '-q', 'origin', `pull/${n}/head`]);
    const v = pkgVersion(showJson(io, 'FETCH_HEAD', 'package.json'));
    out.push({ id: `PR #${n} package.json says ${m.version}`, ok: v === m.version, detail: v ?? 'unreadable' });
    out.push({ id: `PR #${n} CHANGELOG heading names ${m.version}`, ok: hasVersionHeading(showJson(io, 'FETCH_HEAD', 'CHANGELOG.md'), m.version), detail: '"## Unreleased: ' + m.version + '…" is how the page shows it' });
    out.push({ id: `PR #${n} README shows the nightly badge`, ok: hasNpmBadge(showJson(io, 'FETCH_HEAD', 'README.md')), detail: 'the npm nightly badge in the header' });
  }
  return out;
}

/** After the publish: the five things a person looking at GitHub and npm would expect to see, each read from there and not from this machine. */
export function verify(m: Manifest, io: Io): Check[] {
  io.git(['fetch', '-q', 'origin', 'nightly']);
  const head = io.git(['rev-parse', 'origin/nightly']).trim();
  const short = head.slice(0, 7);
  const tag = io.npmTags().nightly ?? '';
  const runs = JSON.parse(io.gh(['api', `repos/{owner}/{repo}/commits/${head}/check-runs`, '--jq', '[.check_runs[] | {name, status, conclusion}]'])) as Array<{ name: string; status: string; conclusion: string | null }>;
  const ci = rollupProblem(runs.map((r) => ({ name: r.name, status: r.status.toUpperCase(), conclusion: (r.conclusion ?? '').toUpperCase() })));
  return [
    { id: 'GitHub nightly head', ok: head.length === 40, detail: short },
    { id: `nightly's package.json says ${m.version}`, ok: pkgVersion(showJson(io, 'origin/nightly', 'package.json')) === m.version, detail: pkgVersion(showJson(io, 'origin/nightly', 'package.json')) ?? '?' },
    { id: 'the page shows it (CHANGELOG heading, README badge)', ok: hasVersionHeading(showJson(io, 'origin/nightly', 'CHANGELOG.md'), m.version) && hasNpmBadge(showJson(io, 'origin/nightly', 'README.md')), detail: 'CHANGELOG + README on origin/nightly' },
    { id: "npm's nightly tag is built from that head", ok: tag.startsWith(`${m.version}-nightly.`) && tag.endsWith(`.g${short}`), detail: tag || 'no nightly tag' },
    { id: 'CI is green on that head', ok: ci === undefined, detail: ci ?? `${runs.length} checks passed or skipped` },
  ];
}

const realIo = (): Io => {
  const run = (cmd: string, args: string[]): string => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`✖ ${cmd} ${args.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout).trim().split('\n')[0]?.slice(0, 200) ?? 'failed'}`);
    return r.stdout;
  };
  return { gh: (a) => run('gh', a), git: (a) => run('git', a), npmTags: () => JSON.parse(run('npm', ['view', '@mvpscale/mm3', 'dist-tags', '--json', '--prefer-online'])) as Record<string, string>, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
};

const line = (c: Check): string => `  ${c.ok ? '✔' : '✖'} ${c.id}${c.ok ? '' : ` → ${c.detail}`}${c.ok && c.detail !== 'ok' ? ` (${c.detail})` : ''}`;

async function approve(yes: boolean): Promise<boolean> {
  if (yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Run this? [y/N] ')).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function until<T>(io: Io, what: string, tries: number, everyMs: number, probe: () => T | undefined): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const got = probe();
    if (got !== undefined) return got;
    await io.sleep(everyMs);
  }
  throw new Error(`✖ ${what}: not there after ${Math.round((tries * everyMs) / 60000)} minutes → look at it on GitHub, nothing further was run`);
}

/** The receipt where anyone can read it with no PR of its own: a comment on the release PR. A failure to post is said, never fatal. */
function comment(io: Io, pr: number, body: string): void {
  try {
    io.gh(['pr', 'comment', String(pr), '--body', body]);
  } catch (e) {
    console.log(`(could not post the receipt on PR #${pr}: ${(e as Error).message})`);
  }
}

async function nightly(m: Manifest, io: Io, yes: boolean): Promise<number> {
  const checks = preflight(m, io, chainProblem());
  console.log([...planText('nightly', m), '', 'checked now (read-only):', ...checks.map(line)].join('\n'));
  if (checks.some((c) => !c.ok)) {
    console.log('\n✖ stopped before anything was merged or published');
    return 1;
  }
  if (!(await approve(yes))) {
    console.log('not run');
    return 1;
  }
  for (const n of m.prs) io.gh(['pr', 'merge', String(n), '--merge']);
  io.git(['fetch', '-q', 'origin', 'nightly']);
  const before = new Date().toISOString();
  io.gh(['workflow', 'run', 'publish.yml', '--ref', 'nightly']);
  const run = await until(io, 'the publish run', 30, 5000, () => (JSON.parse(io.gh(['run', 'list', '--workflow', 'publish.yml', '--branch', 'nightly', '--limit', '5', '--json', 'databaseId,createdAt,event'])) as Array<{ databaseId: number; createdAt: string; event: string }>).find((r) => r.event === 'workflow_dispatch' && r.createdAt >= before)?.databaseId);
  const done = await until(io, 'the publish run to finish', 60, 10000, () => { const r = JSON.parse(io.gh(['run', 'view', String(run), '--json', 'status,conclusion'])) as { status: string; conclusion: string }; return r.status === 'completed' ? r.conclusion : undefined; });
  if (done !== 'success') return console.log(`✖ the publish run ${run} ended ${done} → nothing is verified`), 1;
  const head = io.git(['rev-parse', 'origin/nightly']).trim().slice(0, 7);
  await until(io, "npm's nightly tag", 30, 10000, () => (io.npmTags().nightly?.endsWith(`.g${head}`) ? true : undefined));
  const after = verify(m, io);
  console.log(['', 'verified from GitHub and npm:', ...after.map(line)].join('\n'));
  if (after.some((c) => !c.ok)) return console.log('\n✖ NOT out on nightly: the checks above did not all hold'), 1;
  const npmVersion = io.npmTags().nightly ?? '';
  const rec: ReleaseRecord = { kind: 'release', phase: 'released', id: nextId(readLedger(), 'REL'), ts: new Date().toISOString(), version: m.version, title: m.title, target: 'nightly', head: io.git(['rev-parse', 'origin/nightly']).trim(), prs: m.prs, npmVersion, checks: after.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })) };
  append(rec);
  comment(io, m.prs[0]!, [`**${rec.id}: out on nightly** (${m.version}, ${m.title})`, '', ...after.map((c) => `- ✔ ${c.id}${c.detail === 'ok' ? '' : ` (${c.detail})`}`)].join('\n'));
  console.log(`\nOUT ON NIGHTLY: GitHub nightly ${head} · npm nightly ${npmVersion} · receipt ${rec.id} (in your ledger, and as a comment on PR #${m.prs[0]}; the ledger line rides your next feature PR)`);
  console.log(`next: npm run release -- ceremony`);
  return 0;
}

async function ceremony(m: Manifest, io: Io, yes: boolean): Promise<number> {
  const tag = io.npmTags().nightly ?? '';
  const sha7 = /\.g([0-9a-f]{7,})$/u.exec(tag)?.[1];
  const problems: Check[] = [{ id: `npm's nightly tag is a ${m.version} build`, ok: tag.startsWith(`${m.version}-nightly.`) && sha7 !== undefined, detail: tag || 'no nightly tag' }];
  console.log([...planText('ceremony', m), '', `published: ${tag || '(none)'}`, ...problems.map(line)].join('\n'));
  if (problems.some((c) => !c.ok)) return console.log('\n✖ stopped: nothing to test yet → run: npm run release -- nightly'), 1;
  if (!(await approve(yes))) {
    console.log('not run');
    return 1;
  }
  io.git(['fetch', '-q', 'origin', 'nightly']);
  const tree = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm3-ceremony-')), 'tree');
  io.git(['worktree', 'add', '-q', tree, sha7!]);
  try {
    // a real install, never a link to this checkout's node_modules: a linked one changes the bundle's paths and fails the plugin check for no real reason
    if (spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--silent'], { cwd: tree, stdio: 'inherit' }).status !== 0) return console.log('✖ npm ci failed in the clean worktree → nothing was tested'), 1;
    spawnSync('npm', ['run', '-s', 'ceremony', '--', '--version', tag], { cwd: tree, stdio: 'inherit' }); // a failing gate still writes its record: that record is the point
    const idOf = (r: LedgerRecord): string => `${r.phase}:${'id' in r ? r.id : r.startedId}`;
    const theirs = readFileSync(path.join(tree, 'test/agentic/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LedgerRecord);
    const mine = new Set(readLedger().map(idOf));
    const fresh = theirs.filter((r) => !mine.has(idOf(r)));
    for (const r of fresh) append({ ...r, prev: undefined } as LedgerRecord); // re-chained onto this checkout's ledger
    const last = lastFormal(readLedger());
    if (last) comment(io, m.prs[0]!, `**${last.started.id}: formal ceremony on ${last.started.version}: ${last.finished.passed ? 'passed' : 'did not pass'}** (read it: npm run agentic:release-report -- ${last.started.id})`);
    console.log(`\nbrought ${fresh.length} ledger line(s) home. next: npm run release -- main`);
  } finally {
    io.git(['worktree', 'remove', '--force', tree]);
  }
  return 0;
}

function main(m: Manifest, io: Io): number {
  const last = lastFormal(readLedger());
  const tag = io.npmTags().nightly ?? '';
  const checks: Check[] = [
    { id: 'ledger chain intact', ok: chainProblem() === undefined, detail: chainProblem() ?? 'ok' },
    { id: `a formal ceremony ran on a ${m.version} nightly`, ok: last !== undefined && last.started.version.startsWith(`${m.version}-nightly.`), detail: last ? `${last.started.id} on ${last.started.version}` : 'none → run: npm run release -- ceremony' },
    { id: 'it passed (or the owner accepted it in release.json)', ok: last !== undefined && (last.finished.passed || m.accept.includes(last.started.id)), detail: last ? `${last.started.id} ${last.finished.passed ? 'passed' : 'did not pass; to accept it, list its id under "accept" in release.json'}` : 'none' },
    { id: "it tested what npm's nightly tag points at", ok: last !== undefined && last.started.version === tag, detail: `tested ${last?.started.version ?? '-'}, npm nightly ${tag || '-'}` },
  ];
  console.log([...planText('main', m), '', 'checked now:', ...checks.map(line)].join('\n'));
  if (checks.some((c) => !c.ok)) return console.log('\n✖ not ready for main'), 1;
  console.log(`\nready. the owner's last commands:\n  gh pr create --base main --head nightly --title "release: v${m.version}"\n  gh pr merge <that PR> --merge\n  git tag v${m.version} <the merge commit on main> && git push origin v${m.version}\n  gh workflow run publish.yml --ref v${m.version}`);
  return 0;
}

if (process.argv[1]?.endsWith('release.ts')) {
  const stage = process.argv[2];
  if (stage !== 'nightly' && stage !== 'ceremony' && stage !== 'main') throw new Error('usage: npm run release -- <nightly|ceremony|main> [--yes]');
  const file = 'release.json';
  if (!existsSync(file)) throw new Error('✖ release.json: not found → copy the one from the last release and set its version, title and the PR number');
  const { manifest, stops } = parseManifest(JSON.parse(readFileSync(file, 'utf8')));
  if (!manifest) {
    console.log(stops.join('\n'));
    process.exit(2);
  }
  const io = realIo();
  const yes = process.argv.includes('--yes');
  const code = stage === 'nightly' ? await nightly(manifest, io, yes) : stage === 'ceremony' ? await ceremony(manifest, io, yes) : main(manifest, io);
  process.exit(code);
}
