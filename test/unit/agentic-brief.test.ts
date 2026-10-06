// The ceremony's decision as evidence [C-278]: score, what blocked it and why, what changed since the last pass, impact, blast radius, commands.
import { describe, expect, it } from 'vitest';
import { ceremonyBrief, changedSince } from '../../scripts/agentic/brief.ts';
import type { FinishedRecord, StartedRecord } from '../../scripts/agentic/ledger.ts';

const scenario = (id: string, title: string, checkpoints: string[]) => ({ id, title, checkpoints: checkpoints.map((c) => ({ id: c, text: c })) });
const started = (o: { id?: string; claude?: string; fingerprint?: string; hash?: string } = {}): StartedRecord => ({
  kind: 'ceremony', phase: 'started', id: o.id ?? 'CER-0006', version: '0.1.3-nightly.x.gabc1234', fingerprint: o.fingerprint ?? 'F', formal: true,
  environment: { node: 'v22', claude: o.claude ?? '2.1.292 (Claude Code)', vitest: '5', os: 'linux' },
  definition: { hash: o.hash ?? 'H', rules: { gateModel: 'sonnet', mustPassTrials: 2, firstAttemptTarget: 0.8 }, scenarios: [scenario('B1', 'Ask a plain question', ['engaged', 'verdict-in-promise']), scenario('B2', 'Hand the work to helpers', ['engaged', 'helpers-cite-ids', 'verdict-in-promise'])] },
} as unknown as StartedRecord);
const row = (id: string, trial: number, pass: boolean, failed: string[] = [], model = 'sonnet', attempts = [1]) => ({ id, route: 'mcp', model, trial, pass, failed, attempts });
const finished = (rows: ReturnType<typeof row>[], verdict = 'DO NOT SHIP', rate = 0.5): FinishedRecord => ({ phase: 'finished', startedId: 'CER-0006', passed: false, level3: rows, firstRequestAcceptedRate: rate, decision: { verdict, exceptions: [{ saw: 'the first request was accepted 50% of the time, target 80%' }] } } as unknown as FinishedRecord);

describe('the ceremony brief [C-278]', () => {
  const rows = [row('B1', 1, true), row('B1', 2, true), row('B1', 3, true), row('B2', 1, false, ['helpers-cite-ids']), row('B2', 2, false, ['helpers-cite-ids']), row('B2', 3, false, ['helpers-cite-ids']), row('B1', 1, false, ['engaged'], 'haiku', [])];
  it('[C-278] the score, then each blocking job with what failed, what held, what it means, and the command to read it', () => {
    const text = ceremonyBrief(started(), finished(rows)).join('\n');
    expect(text).toContain('SCORE      sonnet (the gate): 1 of 2 jobs pass');
    expect(text).toContain('3 of 6 trials');
    expect(text).toContain('Hand the work to helpers (B2) · sonnet 0/3');
    expect(text).toContain('failed:  helpers-cite-ids (3 of 3 failed trials)');
    expect(text).toContain('held:    engaged, verdict-in-promise');
    expect(text).toContain('npm run agentic:release-report -- CER-0006 --row B2/mcp/sonnet/1');
  });
  it('[C-278] one failed check while the agents finished the task reads as an isolated check; agents that did not finish read as a product problem', () => {
    expect(ceremonyBrief(started(), finished(rows)).join('\n')).toContain('an isolated check: the agents finished the task');
    const broken = [row('B1', 1, true), row('B1', 2, true), row('B1', 3, true), row('B2', 1, false, ['verdict-in-promise', 'engaged'], 'sonnet', []), row('B2', 2, false, ['verdict-in-promise'], 'sonnet', [0]), row('B2', 3, true)];
    expect(ceremonyBrief(started(), finished(broken)).join('\n')).toContain('the agents did not finish the task cleanly');
  });
  it('[C-278] impact and blast radius name what breaks, what holds, and how wide it is, with the haiku floor apart', () => {
    const text = ceremonyBrief(started(), finished(rows)).join('\n');
    expect(text).toContain('IMPACT     breaks: Hand the work to helpers · holds: Ask a plain question');
    expect(text).toContain('BLAST      1 of 2 gate jobs · every other gate job passed 3+ of 3 · haiku (not gating): 0 of 1 trials');
    expect(text).toContain('WATCH      accepted for now: the first request was accepted 50%');
  });
  it('[C-278] it ends with the two ways forward: re-run only those jobs, or accept the run in release.json', () => {
    const text = ceremonyBrief(started(), finished(rows)).join('\n');
    expect(text).toContain('npm run ceremony -- --version 0.1.3-nightly.x.gabc1234 --only B2 --carry CER-0006');
    expect(text).toContain('list "CER-0006" under "accept" in release.json');
  });
  it('[C-278] what changed since the last passing ceremony is named: Claude Code, the agent-read text, the definition', () => {
    expect(changedSince(started(), started({ id: 'CER-0005', claude: '2.1.291 (Claude Code)' }))).toEqual(['Claude Code 2.1.291 → 2.1.292']);
    expect(changedSince(started(), started({ id: 'CER-0005', fingerprint: 'G', hash: 'I' }))).toEqual(['the text agents read', 'the definition of success (jobs, checkpoints, rules)']);
    expect(ceremonyBrief(started(), finished(rows), started({ id: 'CER-0005', claude: '2.1.291 (Claude Code)' })).join('\n')).toContain('CHANGED    since CER-0005 (passed, 0.1.3-nightly.x.gabc1234): Claude Code 2.1.291 → 2.1.292');
    expect(ceremonyBrief(started(), finished(rows), started({ id: 'CER-0005' })).join('\n')).toContain('nothing in the environment, the agent-read text or the definition');
  });
  it('[C-278] a ceremony with no blocking job says so and still gives the score', () => {
    const ok = [row('B1', 1, true), row('B1', 2, true), row('B2', 1, true), row('B2', 2, true)];
    const text = ceremonyBrief(started(), { ...finished(ok, 'SHIP'), passed: true } as FinishedRecord).join('\n');
    expect(text).toContain('SCORE      sonnet (the gate): 2 of 2 jobs pass');
    expect(text).toContain('BLOCKED BY  nothing');
  });
});
