// `npm run release -- nightly` and `npm run release -- main`: the two steps, each checked from GitHub, npm and the ledger and ending in a receipt.
// Every stage prints the pipeline first, each step marked done, will-do, or not done yet (CI, agent trials, publish, ceremony),
// asks once, runs what is not done, then reads the branch, npm and CI back and says "RELEASED" only when they show it. A nightly or main version is one plain
// number, x.y.z, and nothing attached: no date, commit or label (those belong to features). npm takes a version once, so main promotes the nightly package. Steps skip what is
// already done, so a stage can be run again. nightly: everything merged to nightly since the last nightly release is published to npm as the plain
// version. main: reviews that all of it was tested (CI, trials, a passed ceremony on the published build, an intact ledger), then squeezes the
// tested commit down to the allow-list in release.json into one clean commit for main; the owner merges it, tags and publishes. Main is never worked in.
// The one release asset step: promote verifies and attaches the standalone files .github/workflows/standalone.yml built from nightly's commit (attachStandalone).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { collectSurfaces, manifestOf } from '../test/helpers/guidance-surfaces.ts';
import { ceremonyBrief } from './agentic/brief.ts';
import { assetKey, checksumsProblems } from './check-launcher.ts';
import { append, chainProblem, lastFormal, nextId, readLedger, type FinishedRecord, type LedgerRecord, type ReleaseRecord, type StartedRecord } from './agentic/ledger.ts';

export interface Manifest {
  version: string;
  title: string;
  accept: string[]; // ceremony ids the owner accepted although the gate did not pass
  include: string[]; // what main keeps: everything else is development and stays on nightly
  tested: string[]; // the paths whose change makes a passed ceremony stale: the code and the text agents read
}

export interface Io {
  gh(args: string[]): string;
  git(args: string[]): string;
  npmTags(): Record<string, string>;
  npmHead(version: string): string; // the commit npm recorded for that published version, or '' when it is not published
  npm(args: string[]): string;
  npmTty(args: string[]): boolean; // an npm command that may ask the person something (a one-time password), run in this terminal
  sleep(ms: number): Promise<void>;
}

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

/** Where a step stands: done (skipped), todo (this stage will do it), missing (not done yet, and something outside this stage has to do it). */
export interface Step {
  id: string;
  state: 'done' | 'todo' | 'missing';
  detail: string;
  cost?: string; // what running it costs, in the words the owner reads: free, or what it spends
}

/** The manifest as a person wrote it, or the stops that say what to change. */
export function parseManifest(raw: unknown): { manifest?: Manifest; stops: string[] } {
  const stops: string[] = [];
  const m = (raw ?? {}) as Record<string, unknown>;
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(m.version)) stops.push('✖ version: must look like 0.1.3 → set the version this release will be');
  if (typeof m.title !== 'string' || m.title.trim() === '' || m.title.length > 100) stops.push('✖ title: one line of at most 100 characters → say what this release does for a user');
  if (m.accept !== undefined && !(Array.isArray(m.accept) && m.accept.every((s) => typeof s === 'string'))) stops.push('✖ accept: a list of ceremony ids the owner accepted → for example ["CER-0007"], or leave it out');
  const paths = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((p) => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('..'));
  if (!paths(m.include)) stops.push('✖ include: the paths main keeps, relative to the repo root → list them, for example ["README.md", "src"]');
  if (!paths(m.tested)) stops.push('✖ tested: the paths whose change makes a passed ceremony stale → list the code and agent-read text, for example ["src", "skills"]');
  if (stops.length) return { stops };
  return { manifest: { version: m.version as string, title: (m.title as string).trim(), accept: (m.accept as string[] | undefined) ?? [], include: m.include as string[], tested: m.tested as string[] }, stops };
}

const MARK = { done: '✔ done     ', todo: '▶ will do  ', missing: '✖ not done ' } as const;
export const stepLine = (s: Step): string => `  ${MARK[s.state]} ${s.id}${s.cost ? `  [${s.cost}]` : ''}${s.detail ? ` — ${s.detail}` : ''}`;
const checkLine = (c: Check): string => `  ${c.ok ? '✔' : '✖'} ${c.id} — ${c.detail}`;

const BAD = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

/** undefined when every check has finished and none failed; otherwise the one line that says why not. */
export function rollupProblem(rollup: Array<{ name?: string; status?: string; conclusion?: string }>): string | undefined {
  const pending = rollup.filter((c) => c.status !== undefined && c.status !== 'COMPLETED');
  if (pending.length) return `still running: ${pending.map((c) => c.name ?? '?').join(', ')} → wait for them`;
  const bad = rollup.filter((c) => BAD.has(c.conclusion ?? ''));
  if (bad.length) return `failed: ${bad.map((c) => c.name ?? '?').join(', ')} → fix it`;
  return rollup.length ? undefined : 'no checks reported → CI has not run';
}

const show = (io: Io, ref: string, file: string): string | undefined => {
  try {
    return io.git(['show', `${ref}:${file}`]);
  } catch {
    return undefined;
  }
};
const pkgVersion = (text: string | undefined): string | undefined => (text ? (JSON.parse(text) as { version?: string }).version : undefined);
const headingNames = (changelog: string | undefined, version: string): boolean => new RegExp(`^## Unreleased.*\\b${version.replaceAll('.', '\\.')}\\b`, 'mu').test(changelog ?? '');
const hasNpmBadge = (readme: string | undefined): boolean => /img\.shields\.io\/npm\/v\/@mvpscale\/mm3\/nightly/u.test(readme ?? '');
/** A formal release is one number going up: x.y.z, and nothing attached. The date, time and commit labels belong to features, never to nightly or main. */
export const versionProblem = (v: string, what: string): string | undefined => (/^\d+\.\d+\.\d+$/u.test(v) ? undefined : `${what} "${v}" is not a plain x.y.z version → no date, commit or label on a nightly or main version`);

/** The CHANGELOG's Unreleased section: what goes in a nightly's release notes. */
export function unreleasedNotes(changelog: string): string {
  const a = changelog.search(/^## Unreleased/mu);
  if (a < 0) return '';
  const rest = changelog.slice(a).split('\n').slice(1).join('\n');
  const end = rest.search(/^## /mu);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

interface Release {
  tagName: string;
  isLatest?: boolean;
  isPrerelease?: boolean;
}
const releases = (io: Io): Release[] => JSON.parse(io.gh(['release', 'list', '--limit', '30', '--json', 'tagName,isLatest,isPrerelease'])) as Release[];

/** Every PR merged to nightly since the last nightly release, as "#N title". */
export function featuresSince(io: Io, since: string | undefined): string[] {
  const log = io.git(['log', '--merges', '--format=%s%x1f%b%x1e', since ? `${since}..origin/nightly` : 'origin/nightly']);
  return log.split('\x1e').map((r) => r.trim()).filter(Boolean).flatMap((r) => {
    const [subject = '', body = ''] = r.split('\x1f');
    const n = /Merge pull request #(\d+)/u.exec(subject)?.[1];
    return n ? [`#${n} ${body.split('\n')[0]?.trim() ?? ''}`.trim()] : [];
  });
}

const trialOn = (ledger: LedgerRecord[], fingerprint: string): StartedRecord | undefined => [...ledger].reverse().find((r): r is StartedRecord => r.phase === 'started' && r.kind === 'trial' && r.fingerprint === fingerprint);

/** A ceremony counts for a release when it ran on that version, or on a build of the same x.y.z before the plain number was cut. */
export const onLine = (ceremonyVersion: string, version: string): boolean => ceremonyVersion === version || ceremonyVersion.startsWith(`${version}-nightly.`);

/** The passed ceremony whose evidence still stands at `ref`: it ran on this release, and nothing it tested (the code and the text agents read) differs between the commit it ran on and `ref`. A version number, docs, scripts or workflow changing is not a reason to spend half an hour and millions of tokens again. */
export function ceremonyStands(m: Manifest, io: Io, ledger: LedgerRecord[], ref: string): { id: string; version: string; commit: string } | undefined {
  const last = lastFormal(ledger);
  const commit = last?.started.versionCommit;
  if (!last || !commit || !last.finished.passed || !onLine(last.started.version, m.version)) return undefined;
  return JSON.stringify(cleanLines(io, commit, m.tested)) === JSON.stringify(cleanLines(io, ref, m.tested)) ? { id: last.started.id, version: last.started.version, commit } : undefined;
}

/** A ceremony already ran on this release's code and did not pass: running it again on the same code would only repeat it. */
function ceremonyOnThisCode(m: Manifest, io: Io, ledger: LedgerRecord[], ref: string): boolean {
  const last = lastFormal(ledger);
  const commit = last?.started.versionCommit;
  return last !== undefined && commit != null && onLine(last.started.version, m.version) && JSON.stringify(cleanLines(io, commit, m.tested)) === JSON.stringify(cleanLines(io, ref, m.tested));
}

/** What a ceremony costs, in the owner's terms: no TypeSafe dollars (the sample provider answers), Claude subscription quota for the agents, and the size of the last one so the number is not a guess. */
export function ceremonyCost(ledger: LedgerRecord[]): string {
  const u = [...ledger].reverse().find((r): r is FinishedRecord => r.phase === 'finished' && r.kind === 'ceremony' && r.usage !== undefined)?.usage;
  const m = (n: number): string => `${(n / 1e6).toFixed(1)}M`;
  return `$0 TypeSafe; Claude quota${u ? `, last run ${m(u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens)} tokens in, ${m(u.outputTokens)} out, ${u.claudeRuns} agent runs` : ', about 5M tokens'}`;
}

/** Where every step of the nightly stage stands, read-only, from GitHub, npm and the ledger. The same order the stage runs them. */
export function survey(m: Manifest, io: Io, ledger: LedgerRecord[], fingerprint: string, chain: string | undefined): { steps: Step[]; open: number[] } {
  io.git(['fetch', '-q', '--tags', 'origin', 'nightly']);
  const short = io.git(['rev-parse', 'origin/nightly']).trim().slice(0, 7);
  const steps: Step[] = [{ id: 'ledger chain', state: chain === undefined ? 'done' : 'missing', detail: chain ?? 'intact', cost: 'free' }];
  const open: number[] = [];
  let ahead = io.git(['rev-parse', 'origin/nightly']).trim(); // what nightly will be once the PRs are merged: the last PR's head, which carries nightly
  const prs = (JSON.parse(io.gh(['pr', 'list', '--base', 'nightly', '--state', 'open', '--limit', '30', '--json', 'number,title,isDraft,statusCheckRollup,headRefOid'])) as Array<{ number: number; title: string; isDraft: boolean; statusCheckRollup: Array<{ name?: string; status?: string; conclusion?: string }> }>).sort((x, y) => x.number - y.number);
  for (const pr of prs) {
    const id = `PR #${pr.number} merged into nightly (${pr.title.slice(0, 60)})`;
    if (pr.isDraft) {
      steps.push({ id, state: 'done', detail: 'a draft: left alone' });
      continue;
    }
    const why = rollupProblem(pr.statusCheckRollup ?? []);
    io.git(['fetch', '-q', 'origin', `pull/${pr.number}/head`]);
    if (!why) ahead = io.git(['rev-parse', 'FETCH_HEAD']).trim();
    const v = pkgVersion(show(io, 'FETCH_HEAD', 'package.json'));
    const cues = headingNames(show(io, 'FETCH_HEAD', 'CHANGELOG.md'), m.version) && hasNpmBadge(show(io, 'FETCH_HEAD', 'README.md'));
    const problem = why ?? (v !== m.version ? `its package.json says ${v ?? '?'}, not ${m.version}` : !cues ? `its CHANGELOG heading and README badge must name ${m.version}` : undefined);
    steps.push({ id, state: problem === undefined ? 'todo' : 'missing', detail: problem ?? 'checks green, says ' + m.version, cost: 'free' });
    if (problem === undefined) open.push(pr.number);
  }
  const lastNightly = [...ledger].reverse().find((r): r is ReleaseRecord => r.phase === 'released' && r.target === 'nightly')?.head;
  const lastMain = releases(io).find((r) => /^v\d+\.\d+\.\d+$/u.test(r.tagName))?.tagName;
  steps.splice(1, 0, { id: 'what goes in this nightly', state: 'done', detail: featuresSince(io, lastNightly ?? lastMain).join('; ') || 'nothing merged since the last nightly release', cost: 'free' });
  const trial = trialOn(ledger, fingerprint);
  steps.push({ id: 'agent trials on the current guidance', cost: 'Claude quota when run, $0 TypeSafe unless you pass --paid', state: trial ? 'done' : 'missing', detail: trial ? `${trial.id} ran on it` : 'none ran on the text agents read now → npm run agentic:feature -- <job>  (main needs them, a nightly does not)' });
  if (open.length === 0) {
    const version = pkgVersion(show(io, 'origin/nightly', 'package.json'));
    const page = headingNames(show(io, 'origin/nightly', 'CHANGELOG.md'), m.version) && hasNpmBadge(show(io, 'origin/nightly', 'README.md'));
    steps.push({ id: `nightly says ${m.version} (package.json, CHANGELOG heading, README badge)`, state: version === m.version && page ? 'done' : 'missing', detail: version === m.version && page ? 'all three' : `package.json ${version ?? '?'}; the CHANGELOG heading and README badge must name ${m.version} → fix it in a PR` });
  }
  const head = io.git(['rev-parse', 'origin/nightly']).trim();
  const tag = io.npmTags().nightly ?? '';
  const builtFrom = io.npmHead(m.version);
  const label = versionProblem(m.version, 'release.json version');
  const out = open.length === 0 && tag === m.version && builtFrom === head; // merging a PR moves the head, so a build of the old head is no longer of it
  const taken = builtFrom !== '' && !out; // that version is on npm already, from some other commit: npm will never take it twice
  steps.push({ id: `npm nightly is ${m.version}, built from ${open.length ? 'the merged head' : short}`, cost: 'free: GitHub Actions on a public repo', state: label || taken ? 'missing' : out ? 'done' : 'todo', detail: label ?? (taken ? `${m.version} is already on npm from ${builtFrom.slice(0, 7)}; nightly is at ${open.length ? 'a new head' : short} → bump the version in a PR (and in release.json) to release again` : out ? `${tag}, built from ${short}` : `will publish exactly ${m.version} to npm's nightly tag`) });
  const cer = lastFormal(ledger);
  const stands = ceremonyStands(m, io, ledger, ahead);
  const sameCode = cer !== undefined && cer.started.versionCommit != null && onLine(cer.started.version, m.version) && JSON.stringify(cleanLines(io, cer.started.versionCommit, m.tested)) === JSON.stringify(cleanLines(io, ahead, m.tested));
  steps.push({ id: 'formal ceremony on this release', cost: stands ? 'free' : ceremonyCost(ledger), state: stands ? 'done' : sameCode ? 'missing' : 'todo', detail: stands ? `${stands.id} (${stands.version}) passed, and ${m.tested.join(', ')} are unchanged since ${stands.commit} → its evidence stands, no re-run` : sameCode ? `${cer!.started.id} did not pass on this same code → the evidence prints under STATUS; fix it in a PR` : `will run last, in a clean worktree: about half an hour, free path, its progress prints below (the code or the text agents read changed since ${cer?.started.versionCommit ?? 'the last ceremony'})` });
  return { steps, open };
}

/** The three lines every nightly run ends with, so the state is never in the middle of a paragraph: what is released, whether the build is certified, whether main can go. */
export function statusLines(m: Manifest, ledger: LedgerRecord[], npmVersion: string, released: boolean): string[] {
  const cer = lastFormal(ledger);
  const on = cer && onLine(cer.started.version, m.version) ? cer : undefined;
  const passed = on && (on.finished.passed || m.accept.includes(on.started.id));
  return [
    'STATUS',
    `  nightly   ${released ? `RELEASED  ${npmVersion}` : 'NOT RELEASED'}`,
    `  ceremony  ${on ? `${on.finished.passed ? 'PASSED' : 'DID NOT PASS'}  ${on.started.id}${!on.finished.passed && passed ? ' (accepted in release.json)' : ''}` : 'NOT RUN  (nothing is running)'}`,
    `  main      ${passed ? 'READY  → npm run release -- main' : on ? 'BLOCKED  the ceremony did not pass: the evidence is below, then fix it or list its id under "accept" in release.json' : 'BLOCKED  needs a passed ceremony on this build'}`,
  ];
}

/** The ceremony's evidence for this build, as lines to print under STATUS: the score, what blocked it and why, what changed since the last pass, impact, blast radius, the commands. Empty when no ceremony ran on it. */
export function briefLines(ledger: LedgerRecord[], npmVersion: string): string[] {
  const cer = lastFormal(ledger);
  if (!cer || !(cer.started.version === npmVersion || cer.started.version.startsWith(`${npmVersion}-nightly.`))) return [];
  const before = ledger.filter((r): r is StartedRecord => r.phase === 'started' && r.kind === 'ceremony' && r.formal && r.id !== cer.started.id).reverse().find((s) => ledger.some((f) => f.phase === 'finished' && f.startedId === s.id && f.passed));
  return ceremonyBrief(cer.started, cer.finished, before);
}

/** After everything ran: what a person looking at the branch, npm and CI would see, each read from there. The version must be the plain number and nothing else. */
export function verify(m: Manifest, io: Io): Check[] {
  io.git(['fetch', '-q', '--tags', 'origin', 'nightly']);
  const head = io.git(['rev-parse', 'origin/nightly']).trim();
  const short = head.slice(0, 7);
  const tag = io.npmTags().nightly ?? '';
  const built = tag ? io.npmHead(tag) : '';
  const runs = JSON.parse(io.gh(['api', `repos/{owner}/{repo}/commits/${head}/check-runs`, '--jq', '[.check_runs[] | {name, status, conclusion}]'])) as Array<{ name: string; status: string; conclusion: string | null }>;
  const ci = rollupProblem(runs.map((r) => ({ name: r.name, status: r.status.toUpperCase(), conclusion: (r.conclusion ?? '').toUpperCase() })));
  const v = pkgVersion(show(io, 'origin/nightly', 'package.json'));
  return [
    { id: 'npm nightly is a plain x.y.z version', ok: versionProblem(tag, 'npm nightly') === undefined, detail: versionProblem(tag, 'npm nightly') ?? tag },
    { id: `npm nightly is ${m.version}`, ok: tag === m.version, detail: tag || 'no nightly tag' },
    { id: "nightly's package.json says the same", ok: v === m.version, detail: v ?? '?' },
    { id: "npm built it from nightly's head", ok: built !== '' && built === head, detail: built ? `npm gitHead ${built.slice(0, 7)}, nightly head ${short}` : 'npm records no commit for it' },
    { id: 'CI is green on that head', ok: ci === undefined, detail: ci ?? `${runs.length} checks passed or skipped` },
  ];
}

const keeps = (file: string, include: string[]): boolean => include.some((p) => file === p || file.startsWith(p.endsWith('/') ? p : `${p}/`));

/** The files a ref would give main: "<blob> <path>" for every tracked file the allow-list keeps. Two refs with the same lines hold the same clean copy. */
export function cleanLines(io: Io, ref: string, include: string[]): string[] {
  return io.git(['ls-tree', '-r', ref]).split('\n').filter(Boolean).flatMap((l) => {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/u.exec(l);
    if (!m || !keeps(m[2]!, include)) return [];
    // the one line main rewrites: nightly's "## Unreleased: x.y.z…" heading becomes "## vx.y.z, <date>", so the changelog is compared with that line blanked
    const blob = m[2] === 'CHANGELOG.md' ? createHash('sha1').update(blankHeading(show(io, ref, 'CHANGELOG.md') ?? '')).digest('hex') : m[1];
    return [`${blob} ${m[2]}`];
  }).sort();
}

const blankHeading = (changelog: string): string => changelog.replace(/^## (Unreleased.*|v\d+\.\d+\.\d+.*)$/mu, '## RELEASE');

/** The section of the changelog a release is announced with: everything under the version's heading, up to the next one. */
export function releaseNotes(changelog: string, version: string): string {
  const rest = changelog.split(new RegExp(`^## v${version.replaceAll('.', '\\.')}.*$`, 'mu'))[1] ?? '';
  const end = rest.search(/^## /mu);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/** Relative links in the README and CHANGELOG that the clean copy would not have. Main must not ship a dead link. */
export function deadLinks(io: Io, ref: string, include: string[]): string[] {
  const have = cleanLines(io, ref, include).map((l) => l.split(' ').slice(1).join(' '));
  const dead = new Set<string>();
  for (const file of ['README.md', 'CHANGELOG.md']) {
    for (const m of (show(io, ref, file) ?? '').matchAll(/(?:\]\(|src=")((?!https?:|#|mailto:)[^)"\s#]+)/gu)) {
      const target = m[1]!.replace(/^\.\//u, '');
      if (!have.some((f) => f === target || f.startsWith(`${target.replace(/\/$/u, '')}/`))) dead.add(`${file} → ${target}`);
    }
  }
  return [...dead];
}

const realIo = (): Io => {
  const run = (cmd: string, args: string[]): string => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`✖ ${cmd} ${args.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout).trim().split('\n')[0]?.slice(0, 200) ?? 'failed'}`);
    return r.stdout;
  };
  return { gh: (a) => run('gh', a), git: (a) => run('git', a), npm: (a) => run('npm', a), npmTty: (a) => spawnSync('npm', a, { stdio: 'inherit' }).status === 0, npmTags: () => JSON.parse(run('npm', ['view', '@mvpscale/mm3', 'dist-tags', '--json', '--prefer-online'])) as Record<string, string>, npmHead: (v) => { const r = spawnSync('npm', ['view', `@mvpscale/mm3@${v}`, 'gitHead', '--prefer-online'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; }, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
};

async function approve(yes: boolean): Promise<boolean> {
  if (yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Run the steps marked "will do"? [y/N] ')).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function until<T>(io: Io, what: string, tries: number, everyMs: number, probe: () => T | undefined): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const got = probe();
    if (got !== undefined) return got;
    await io.sleep(everyMs);
  }
  throw new Error(`✖ ${what}: not there after ${Math.round((tries * everyMs) / 60000)} minutes → look at it on GitHub; the steps before it stay done`);
}

/** The receipt where anyone can read it with no PR of its own. A failure to post is said, never fatal. */
function comment(io: Io, pr: number | undefined, body: string): void {
  if (pr === undefined) return;
  try {
    io.gh(['pr', 'comment', String(pr), '--body', body]);
  } catch (e) {
    console.log(`(could not post the receipt on PR #${pr}: ${(e as Error).message})`);
  }
}

async function nightly(m: Manifest, io: Io, yes: boolean): Promise<number> {
  const { steps, open } = survey(m, io, readLedger(), manifestOf(collectSurfaces()).fingerprint, chainProblem());
  console.log([`RELEASE ${m.version} to nightly · ${m.title}`, '', ...steps.map(stepLine), '', `COST  ${ceremonyCost(readLedger())} (the ceremony is the only step that spends anything); everything else is free`].join('\n'));
  const blocked = steps.filter((s) => s.state === 'missing' && !/agent trials|formal ceremony/u.test(s.id));
  if (blocked.length) {
    console.log(`\n✖ stopped before changing anything: ${blocked.map((s) => s.id).join('; ')}`);
    return 1;
  }
  if (steps.every((s) => s.state !== 'todo')) console.log('\nnothing to do: every step is done');
  else if (!(await approve(yes))) {
    console.log('not run');
    return 1;
  }
  for (const n of open) io.gh(['pr', 'merge', String(n), '--merge']);
  const merged = open;
  io.git(['fetch', '-q', '--tags', 'origin', 'nightly']);
  const head = io.git(['rev-parse', 'origin/nightly']).trim();
  const short = head.slice(0, 7);
  const out = (): boolean => (io.npmTags().nightly ?? '') === m.version && io.npmHead(m.version) === head;
  if (!out()) {
    const before = new Date(Date.now() - 60000).toISOString(); // a minute of slack: this machine's clock is not GitHub's
    io.gh(['workflow', 'run', 'publish.yml', '--ref', 'nightly']);
    const run = await until(io, 'the publish run', 30, 5000, () => (JSON.parse(io.gh(['run', 'list', '--workflow', 'publish.yml', '--branch', 'nightly', '--limit', '5', '--json', 'databaseId,createdAt,event'])) as Array<{ databaseId: number; createdAt: string; event: string }>).find((r) => r.event === 'workflow_dispatch' && r.createdAt >= before)?.databaseId);
    const done = await until(io, 'the publish run to finish', 60, 10000, () => { const r = JSON.parse(io.gh(['run', 'view', String(run), '--json', 'status,conclusion'])) as { status: string; conclusion: string }; return r.status === 'completed' ? r.conclusion : undefined; });
    if (done !== 'success') {
      console.log(`✖ the publish run ${run} ended ${done} → nothing past it ran`);
      return 1;
    }
    await until(io, "npm's nightly tag", 30, 10000, () => (out() ? true : undefined));
  }
  const npmVersion = io.npmTags().nightly ?? '';
  const after = verify(m, io);
  console.log(['', 'read back from GitHub and npm:', ...after.map(checkLine)].join('\n'));
  if (after.some((c) => !c.ok)) {
    console.log('\n✖ NOT released to nightly: the checks above did not all hold');
    return 1;
  }
  const prior = readLedger().find((r): r is ReleaseRecord => r.phase === 'released' && r.target === 'nightly' && r.npmVersion === npmVersion);
  const rec: ReleaseRecord = prior ?? { kind: 'release', phase: 'released', id: nextId(readLedger(), 'REL'), ts: new Date().toISOString(), version: m.version, title: m.title, target: 'nightly', head, prs: merged, npmVersion, checks: after.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })) };
  if (!prior) {
    append(rec);
    comment(io, merged[merged.length - 1], [`**${rec.id}: released to nightly** (${m.version}, ${m.title})`, '', ...after.map((c) => `- ✔ ${c.id}: ${c.detail}`)].join('\n'));
  }
  console.log(`\nRELEASED to nightly: ${npmVersion} · the branch and npm's nightly tag say ${npmVersion}, built from ${short} · receipt ${rec.id}${prior ? ' (recorded earlier)' : ''}`);
  const standing = ceremonyStands(m, io, readLedger(), head);
  if (standing) console.log(`\nformal ceremony: ${standing.id} stands (${standing.version} passed; ${m.tested.join(', ')} unchanged since ${standing.commit}), not re-run`);
  else if (!ceremonyOnThisCode(m, io, readLedger(), head)) {
    console.log(`\nformal ceremony on ${npmVersion}: starting (about half an hour; each job prints as it finishes)`);
    const code = runCeremony(io, npmVersion, head);
    if (code !== 0) console.log('✖ the ceremony could not run → nothing was tested');
    comment(io, merged[merged.length - 1], ((): string => { const l = lastFormal(readLedger()); return l && l.started.version === npmVersion ? `**${l.started.id}: formal ceremony on ${npmVersion}: ${l.finished.passed ? 'passed' : 'did not pass'}** (read it: npm run agentic:release-report -- ${l.started.id})` : ''; })());
  }
  console.log(['', ...statusLines(m, readLedger(), npmVersion, true), '', ...briefLines(readLedger(), npmVersion)].join('\n'));
  return 0;
}

/** The formal ceremony on a published nightly, from a clean worktree at the commit it was built from, with a real npm ci: a link to this checkout's node_modules changes the plugin bundle's paths and fails its check for no real reason. Its record is brought home into this ledger. */
function runCeremony(io: Io, npmVersion: string, head: string): number {
  const tree = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm3-ceremony-')), 'tree');
  io.git(['worktree', 'add', '-q', tree, head]);
  try {
    if (spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--silent'], { cwd: tree, stdio: 'inherit' }).status !== 0) return 1;
    spawnSync('npm', ['run', '-s', 'ceremony', '--', '--version', npmVersion], { cwd: tree, stdio: 'inherit' }); // a failing gate still writes its record: that record is the point
    const idOf = (r: LedgerRecord): string => `${r.phase}:${'id' in r ? r.id : r.startedId}`;
    const theirs = readFileSync(path.join(tree, 'test/agentic/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LedgerRecord);
    const mine = new Set(readLedger().map(idOf));
    for (const r of theirs.filter((x) => !mine.has(idOf(x)))) append({ ...r, prev: undefined } as LedgerRecord); // re-chained onto this checkout's ledger
    // the transcripts the ledger's digests point at live in the worktree, which is removed below: keep them where the report reads them
    const archive = path.join(tree, 'lab/archive/agentic');
    if (existsSync(archive)) {
      mkdirSync('lab/archive/agentic', { recursive: true });
      cpSync(archive, 'lab/archive/agentic', { recursive: true });
    }
    return 0;
  } finally {
    io.git(['worktree', 'remove', '--force', tree]);
  }
}

/** Where every step of the main stage stands. The gate is everything that says the code was tested; the last steps are the clean copy itself. */
export function surveyMain(m: Manifest, io: Io, ledger: LedgerRecord[], fingerprint: string, chain: string | undefined): { steps: Step[]; head: string; tested: string | undefined; todo: boolean } {
  io.git(['fetch', '-q', '--tags', 'origin', 'nightly', 'main']);
  const head = io.git(['rev-parse', 'origin/nightly']).trim();
  const steps: Step[] = [{ id: 'ledger chain', state: chain === undefined ? 'done' : 'missing', detail: chain ?? 'intact' }];
  const nightlyOk = verify(m, io);
  const bad = nightlyOk.filter((c) => !c.ok);
  steps.push({ id: 'nightly is released and green', state: bad.length === 0 ? 'done' : 'missing', detail: bad.length === 0 ? `${nightlyOk.length} checks hold` : `${bad.map((c) => c.id).join('; ')} → npm run release -- nightly` });
  const trial = trialOn(ledger, fingerprint);
  steps.push({ id: 'agent trials ran on the current guidance', state: trial ? 'done' : 'missing', detail: trial ? trial.id : 'none → npm run agentic:feature -- <job>' });
  const last = lastFormal(ledger);
  const onBuild = last !== undefined && (last.started.version === m.version || last.started.version.startsWith(`${m.version}-nightly.`));
  steps.push({ id: `a formal ceremony ran on a ${m.version} nightly`, state: onBuild ? 'done' : 'missing', detail: onBuild ? `${last.started.id} on ${last.started.version}` : `none → npm run ceremony -- --version ${io.npmTags().nightly ?? '<npm nightly version>'}` });
  const passed = onBuild && (last.finished.passed || m.accept.includes(last.started.id));
  steps.push({ id: 'it passed, or the owner accepted it (release.json "accept")', state: passed ? 'done' : 'missing', detail: !onBuild ? '-' : last.finished.passed ? `${last.started.id} passed` : `${last.started.id} did not pass → read it, fix it, or list its id under "accept"` });
  const tested = onBuild ? last.started.versionCommit ?? undefined : undefined;
  const same = tested !== undefined && JSON.stringify(cleanLines(io, tested, m.tested)) === JSON.stringify(cleanLines(io, head, m.tested));
  steps.push({ id: 'the code and agent-read text are what the ceremony tested', state: same ? 'done' : 'missing', detail: same ? `${m.tested.join(', ')} unchanged since ${tested}` : tested ? `${m.tested.join(', ')} changed between ${tested} and nightly's head → publish and run the ceremony again` : '-' });
  const dead = deadLinks(io, head, m.include);
  steps.push({ id: 'no dead links in the README or CHANGELOG on main', state: dead.length === 0 ? 'done' : 'missing', detail: dead.length === 0 ? 'every relative link resolves' : `${dead.join('; ')} → add the target to "include" in release.json, or change the link` });
  const onMain = JSON.stringify(cleanLines(io, 'origin/main', m.include)) === JSON.stringify(cleanLines(io, head, m.include)) && io.git(['ls-tree', '-r', '--name-only', 'origin/main']).split('\n').filter(Boolean).every((f) => keeps(f, m.include));
  steps.push({ id: 'main holds the clean copy', state: onMain ? 'done' : 'todo', detail: onMain ? 'main equals the clean copy of nightly' : 'will build one commit from nightly with only the "include" paths, push release/v' + m.version + ' and open a PR into main' });
  return { steps, head, tested, todo: !onMain };
}

async function main(m: Manifest, io: Io, yes: boolean): Promise<number> {
  io.git(['fetch', '-q', '--tags', 'origin', 'main']);
  const v = `v${m.version}`;
  const onMainNow = pkgVersion(show(io, 'origin/main', 'package.json'));
  const targetOf = (): string => { try { return io.gh(['api', `repos/{owner}/{repo}/git/ref/tags/${v}`, '--jq', '.object.sha']).trim(); } catch { return ''; } };
  if (onMainNow === m.version && io.npmTags().latest === m.version && targetOf() === io.git(['rev-parse', 'origin/main']).trim()) {
    console.log(`nothing new: main is already ${m.version}, on npm latest and as the GitHub release. Release a new version from nightly first (bump it in a PR).`);
    return 0;
  }
  const { steps, head, tested, todo } = surveyMain(m, io, readLedger(), manifestOf(collectSurfaces()).fingerprint, chainProblem());
  const candidate = targetOf(); // the release candidate nightly left: the same release, to be moved onto main's clean commit
  const latest = io.npmTags().latest ?? '';
  const after: Step[] = [
    { id: 'squash-merge the clean copy into main', state: todo ? 'todo' : 'done', detail: todo ? 'one commit on main' : 'main already holds it', cost: 'free' },
    { id: `npm latest becomes ${m.version}`, state: latest === m.version ? 'done' : 'todo', detail: latest === m.version ? 'already' : `npm dist-tag add @mvpscale/mm3@${m.version} latest: the package nightly published, as tested`, cost: 'free' },
    { id: `GitHub release ${v}`, state: candidate !== '' && !todo && candidate === io.git(['rev-parse', 'origin/main']).trim() ? 'done' : 'todo', detail: candidate ? `moves from nightly's commit ${candidate.slice(0, 7)} to main's clean commit: the same release, one tag` : 'one release and tag on main\'s clean commit', cost: 'free' },
  ];
  const whoami = (): string => { try { return io.npm(['whoami']).trim(); } catch { return ''; } };
  const who = whoami();
  if (latest !== m.version) after.splice(1, 0, { id: 'npm login in this terminal', state: who ? 'done' : 'todo', detail: who ? `logged in as ${who}` : "npm's own login runs first, here, so nothing is merged unless it works (npm will not let a workflow move a tag; the script does it with your login)", cost: 'free' });
  console.log([`RELEASE ${m.version} to main · clean copy of the tested nightly`, '', ...steps.map(stepLine), ...after.map(stepLine)].join('\n'));
  const missing = steps.filter((s) => s.state === 'missing');
  if (missing.length) {
    console.log(`\n✖ not ready for main: ${missing.map((s) => s.id).join('; ')}`);
    return 1;
  }
  if (![...steps, ...after].some((s) => s.state === 'todo')) console.log('\nnothing to do: every step is done');
  else if (!(await approve(yes))) {
    console.log('not run');
    return 1;
  }
  if (latest !== m.version && !who) {
    spawnSync('npm', ['login'], { stdio: 'inherit' }); // npm's own login, in this terminal: before anything is merged, so a failed login leaves nothing half done
    if (!whoami()) {
      console.log('✖ npm login did not complete → nothing was merged or changed; run the command again');
      return 1;
    }
  }
  if (todo) {
    const tree = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm3-main-')), 'tree');
    io.git(['worktree', 'add', '-q', '--detach', tree, 'origin/main']);
    try {
      const g = (...a: string[]): string => io.git(['-C', tree, ...a]);
      g('rm', '-rfq', '--ignore-unmatch', '.');
      const keep = m.include.filter((p) => io.git(['ls-tree', '--name-only', head, '--', p]).trim() !== '');
      g('checkout', head, '--', ...keep);
      const notes = path.join(tree, 'CHANGELOG.md');
      try {
        writeFileSync(notes, readFileSync(notes, 'utf8').replace(/^## Unreleased.*$/mu, `## ${v}, ${new Date().toISOString().slice(0, 10)}`)); // one read, one write: no exists-then-read gap
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // a clean copy with no changelog has no heading to rewrite
      }
      g('add', '-A');
      g('-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', `release: ${v}, a clean copy of nightly ${head.slice(0, 7)} (${tested?.slice(0, 7)} was tested)`);
      g('push', '-q', '--force-with-lease', 'origin', `HEAD:refs/heads/release/${v}`);
      const existing = (JSON.parse(io.gh(['pr', 'list', '--head', `release/${v}`, '--base', 'main', '--json', 'number'])) as Array<{ number: number }>)[0]?.number;
      const pr = existing ?? Number(/\/pull\/(\d+)/u.exec(io.gh(['pr', 'create', '--base', 'main', '--head', `release/${v}`, '--title', `release: ${v}`, '--body', `${m.title}\n\nA clean copy of nightly \`${head.slice(0, 7)}\`: only the paths in \`release.json\` "include". The code and tests are what the formal ceremony passed on (\`${tested?.slice(0, 7)}\`); nothing under those paths changed since.`]))?.[1] ?? 0);
      if (!pr) throw new Error('✖ could not open the clean-copy PR → look at release/' + v + ' on GitHub');
      console.log(`\nbuilt the clean copy: PR #${pr}`);
      await until(io, `PR #${pr} to be mergeable`, 12, 5000, () => { try { io.gh(['pr', 'merge', String(pr), '--squash']); return true; } catch { return undefined; } });
      io.git(['fetch', '-q', '--tags', 'origin', 'main']);
      console.log(`squash-merged into main: ${io.git(['rev-parse', '--short', 'origin/main']).trim()}`);
    } finally {
      io.git(['worktree', 'remove', '--force', tree]);
    }
  }
  return promote(m, io, steps);
}

/** The attach point for the standalone files: the artifact `standalone-<version>` that .github/workflows/standalone.yml built from the commit npm's
 *  nightly was built from (main's clean commit holds no scripts, so nightly's commit is the one the files can be proven to come from), each file's
 *  build-provenance attestation verified first, then uploaded to the release `promote` just created. Returns one line; a file that does not verify is
 *  never attached, and nothing here stops the release (the npm package and the tag are already done). */
function attachStandalone(m: Manifest, io: Io, v: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-standalone-'));
  try {
    const built = io.npmHead(m.version);
    if (!built) return `✖ standalone files: not attached (npm records no commit for ${m.version}) → run "gh release upload ${v} <files> --clobber" once they are built`;
    const run = (JSON.parse(io.gh(['run', 'list', '--workflow', 'standalone.yml', '--branch', 'nightly', '--commit', built, '--status', 'success', '--limit', '1', '--json', 'databaseId'])) as Array<{ databaseId: number }>)[0]?.databaseId;
    if (run === undefined) return `✖ standalone files: not attached (no green standalone run on ${built.slice(0, 7)}) → run the standalone workflow on nightly, then "gh release upload ${v} <files> --clobber"`;
    io.gh(['run', 'download', String(run), '--name', `standalone-${m.version}`, '--dir', dir]);
    const repo = io.gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const files = readdirSync(dir).sort().map((f) => path.join(dir, f));
    if (files.length === 0) return `✖ standalone files: run ${run} left no files under standalone-${m.version}`;
    // The plugin the release ships pins these files' hashes (launcher/checksums.json, from the same commit); a file it does not name, or a hash that differs, would make the launcher refuse the download for good.
    const hashes = Object.fromEntries(files.filter((f) => assetKey(path.basename(f), m.version) !== undefined).map((f) => [path.basename(f), createHash('sha256').update(readFileSync(f)).digest('hex')]));
    const pinProblems = checksumsProblems(show(io, built, 'launcher/checksums.json'), m.version, repo, hashes);
    if (pinProblems.length > 0) return `✖ standalone files: not attached (${pinProblems[0]!.replace(/^✖ /u, '').split(' → ')[0]}) → on a new branch run "npm run build:binary" for each target and "npm run gen:checksums", merge that to nightly and release again`;
    for (const f of files) io.gh(['attestation', 'verify', f, '--repo', repo, '--signer-workflow', `${repo}/.github/workflows/standalone.yml`]);
    io.gh(['release', 'upload', v, ...files, '--clobber']);
    return `✔ standalone files: ${files.map((f) => path.basename(f)).join(', ')} attached, each verified as built by the standalone workflow (run ${run}) from ${built.slice(0, 7)}`;
  } catch (e) {
    return `✖ standalone files: not attached (${(e as Error).message.split('\n')[0]}) → fix that, then "gh release upload ${v} <files> --clobber"`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** main holds the clean copy: promote the package nightly published (npm takes a version once) to latest, and move the release candidate's one GitHub release and tag onto main's commit. Reads npm, the tag and main back before saying released. */
async function promote(m: Manifest, io: Io, steps: Step[]): Promise<number> {
  const v = `v${m.version}`;
  const headMain = io.git(['rev-parse', 'origin/main']).trim();
  if ((io.npmTags().latest ?? '') !== m.version && !io.npmTty(['dist-tag', 'add', `@mvpscale/mm3@${m.version}`, 'latest'])) {
    console.log('✖ npm would not move latest (its one-time password, or no permission) → nothing else changed; run the command again and answer npm\'s prompt');
    return 1;
  }
  const targetOf = (): string => { try { return io.gh(['api', `repos/{owner}/{repo}/git/ref/tags/${v}`, '--jq', '.object.sha']).trim(); } catch { return ''; } };
  if (targetOf() !== headMain) {
    if (targetOf() !== '') io.gh(['release', 'delete', v, '--cleanup-tag', '--yes']); // the candidate nightly left is the same release, moved: a tag cannot be re-pointed
    io.gh(['release', 'create', v, '--target', headMain, '--title', m.version, '--notes', releaseNotes(show(io, 'origin/main', 'CHANGELOG.md') ?? '', m.version) || m.title]);
  }
  console.log(attachStandalone(m, io, v));
  const rel = releases(io).find((r) => r.tagName === v);
  const latest = io.npmTags().latest ?? '';
  const checks: Check[] = [
    { id: 'npm latest is a plain x.y.z version', ok: versionProblem(latest, 'npm latest') === undefined, detail: versionProblem(latest, 'npm latest') ?? latest },
    { id: `npm latest is ${m.version}`, ok: latest === m.version, detail: latest },
    { id: 'GitHub Release is a plain vx.y.z and the newest', ok: rel !== undefined && rel.isLatest === true && /^v\d+\.\d+\.\d+$/u.test(rel.tagName), detail: rel ? `${rel.tagName}${rel.isLatest ? ' (Latest)' : ''}` : 'none' },
    { id: "the tag is on main's clean commit", ok: targetOf() === headMain, detail: `tag → ${targetOf().slice(0, 7) || 'none'}, main ${headMain.slice(0, 7)}` },
    { id: "main's package.json says the same", ok: pkgVersion(show(io, 'origin/main', 'package.json')) === m.version, detail: pkgVersion(show(io, 'origin/main', 'package.json')) ?? '?' },
  ];
  console.log(['', 'read back from GitHub and npm:', ...checks.map(checkLine)].join('\n'));
  if (checks.some((c) => !c.ok)) {
    console.log('\n✖ NOT released to main: the checks above did not all hold');
    return 1;
  }
  const rec: ReleaseRecord = { kind: 'release', phase: 'released', id: nextId(readLedger(), 'REL'), ts: new Date().toISOString(), version: m.version, title: m.title, target: 'main', head: headMain, prs: [], npmVersion: latest, checks: [...steps.map((s) => ({ id: s.id, ok: s.state === 'done', detail: s.detail })), ...checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail }))] };
  const prior = readLedger().find((r): r is ReleaseRecord => r.phase === 'released' && r.target === 'main' && r.npmVersion === latest);
  if (!prior) append(rec);
  console.log(`\nRELEASED to main: ${m.version} · npm latest ${latest} · GitHub Release ${v} (Latest) on main's clean commit · receipt ${(prior ?? rec).id}\nnext: set the repo's default branch to main (a repo setting only you can change), so the plugin installer and README links resolve to the clean copy`);
  return 0;
}

if (process.argv[1]?.endsWith('release.ts')) {
  const stage = process.argv[2];
  if (stage !== 'nightly' && stage !== 'main') throw new Error('usage: npm run release -- <nightly|main> [--yes]');
  const file = 'release.json';
  if (!existsSync(file)) throw new Error('✖ release.json: not found → copy the one from the last release and set its version and title');
  const { manifest, stops } = parseManifest(JSON.parse(readFileSync(file, 'utf8')));
  if (!manifest) {
    console.log(stops.join('\n'));
    process.exit(2);
  }
  const io = realIo();
  const yes = process.argv.includes('--yes');
  process.exit(stage === 'nightly' ? await nightly(manifest, io, yes) : await main(manifest, io, yes));
}
