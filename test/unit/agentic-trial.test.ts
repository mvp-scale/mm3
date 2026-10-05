// The trial command [C-267]: a development check of one job on a local build, recorded like a ceremony but never formal, free by
// default, and paid only with an explicit dollar cap that MM3's own budget holds. The pieces that decide that are tested here.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { definitionOf, lastFormal, nextId, recordGaps, type FinishedRecord, type StartedRecord } from '../../scripts/agentic/ledger.ts';
import { adapters, setCap, shimMm3, spentUsd } from '../../scripts/agentic/run.ts';
import { spawnSync } from 'node:child_process';
import { keyFound, parseTrialArgs } from '../../scripts/agentic/trial.ts';
import { tellRun } from '../../scripts/agentic/release-report.ts';

describe('trial arguments [C-267]', () => {
  it('[C-267] a job is all that is needed: Sonnet, one trial, the free path', () => {
    expect(parseTrialArgs(['F1-change-a-setting'])).toEqual({ job: 'F1-change-a-setting', model: 'sonnet', trials: 1, route: undefined, paid: undefined });
  });
  it('[C-267] the model, trial count and route are chosen on the command line', () => {
    expect(parseTrialArgs(['F2-spend-cap', '--model', 'haiku', '--trials', '3', '--route', 'mcp'])).toMatchObject({ job: 'F2-spend-cap', model: 'haiku', trials: 3, route: 'mcp' });
  });
  it('[C-267] paid needs the approval on the command line, and the approval means nothing without paid', () => {
    expect(parseTrialArgs(['F1-change-a-setting', '--paid', '--approve-usd', '0.5']).paid).toEqual({ approvedUsd: 0.5 });
    expect(() => parseTrialArgs(['F1-change-a-setting', '--paid'])).toThrow(/--paid needs the dollars you approve/u);
    expect(() => parseTrialArgs(['F1-change-a-setting', '--approve-usd', '0.5'])).toThrow(/only means something with --paid/u);
    expect(() => parseTrialArgs(['F1-change-a-setting', '--paid', '--approve-usd', '0'])).toThrow(/positive number of dollars/u);
  });
  it('[C-267] every mistake is an error that says what to change', () => {
    expect(() => parseTrialArgs([])).toThrow(/name a job → npm run agentic:feature/u);
    expect(() => parseTrialArgs(['x', '--model', 'opus'])).toThrow(/is not a model → sonnet or haiku/u);
    expect(() => parseTrialArgs(['x', '--trials', '0'])).toThrow(/whole number from 1 to 10/u);
    expect(() => parseTrialArgs(['x', '--route', 'web'])).toThrow(/is not a route → cli or mcp/u);
  });
});

describe('a paid trial checks for a key first [C-267]', () => {
  it('[C-267] it reads what doctor says, never a key: a resolved key and a live provider pass; no key, or the sample provider, do not', () => {
    expect(keyFound('doctor:\n  provider: typesafe\n  key: yes · from env TYPESAFE_API_KEY\n')).toBe(true);
    expect(keyFound('doctor:\n  provider: fake\n  key: no  → run "mm3 init" to add one\n')).toBe(false);
    expect(keyFound('doctor:\n  provider: fake\n  key: yes · from keychain\n')).toBe(false); // a key, but the sample provider is switched on
  });
});

describe('a paid trial must really be live [C-267]', () => {
  it('[C-267] the providers that answered are read from the project ledger, so a run labelled paid on the sample provider is caught', () => {
    const ledger = [JSON.stringify({ kind: 'run', adapter: 'fake' }), JSON.stringify({ kind: 'run', adapter: 'typesafe' }), JSON.stringify({ kind: 'config' }), JSON.stringify({ kind: 'run', adapter: 'typesafe' })].join('\n');
    expect(adapters(ledger)).toEqual({ fake: 1, typesafe: 2 });
    expect(adapters('')).toEqual({});
  });
  it('[C-267] a report on a paid run that recorded no spend says the live classifier may never have been reached', () => {
    const sp = { full: [{ id: 'S1', title: 'Spend', goal: 'g', prompt: 'p', model: 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged'] }], rules: { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 } };
    const started: StartedRecord = { kind: 'trial', phase: 'started', schema: 2, id: 'TRL-0001', ts: 't', version: 'local+abc', versionCommit: 'abc', head: 'abc', dirty: false, fingerprint: 'f', definition: definitionOf(sp, { tag: 't', sha: 's' }), mode: 'paid', paid: { approvedUsd: 0.05 }, trialsOverride: 1, formal: false, formalReason: 'trial' };
    const done: FinishedRecord = { kind: 'trial', phase: 'finished', startedId: 'TRL-0001', ts: 't', passed: true, spentUsd: 0, level3: [{ id: 'S1', route: 'mcp', model: 'sonnet', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, transcript: 't' }] };
    expect(tellRun([started, done], 'TRL-0001', undefined).join('\n')).toContain('labelled PAID but recorded no spend');
    expect(tellRun([started, { ...done, spentUsd: 0.0021 }], 'TRL-0001', undefined).join('\n')).not.toContain('labelled PAID but recorded no spend');
  });
});

describe('paid trials hold their cap [C-267]', () => {
  it('[C-267] real spend is the sum of the project ledger\'s run costs, and nothing else', () => {
    const ledger = [JSON.stringify({ kind: 'run', costUsd: 0.0012 }), JSON.stringify({ kind: 'config', settings: {} }), JSON.stringify({ kind: 'run', costUsd: 0.0003 }), JSON.stringify({ kind: 'run' }), 'not json {"kind":"run"'].join('\n');
    expect(spentUsd(ledger)).toBeCloseTo(0.0015, 10);
    expect(spentUsd('')).toBe(0);
  });
  it('[C-267] the cap goes into the project\'s config so MM3\'s own budget enforces it, keeping what a job already wrote', () => {
    const dir = (): string => mkdtempSync(path.join(os.tmpdir(), 'mm3-cap-'));
    const a = dir();
    setCap(a, 0.5);
    expect(readFileSync(path.join(a, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  usd: 0.5\n');
    const b = dir();
    mkdirSync(path.join(b, '.mm3'));
    writeFileSync(path.join(b, '.mm3', 'config.yaml'), 'budget:\n  runs: 1\n');
    setCap(b, 0.25);
    expect(readFileSync(path.join(b, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  usd: 0.25\n  runs: 1\n');
    setCap(b, 0.1); // a second cap replaces the first
    expect(readFileSync(path.join(b, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  usd: 0.1\n  runs: 1\n');
  });
});

describe('the install-health setup [C-266]', () => {
  it('[C-266] the fake plugin record reaches MM3 alone: a shim sets CLAUDE_CONFIG_DIR and runs the real mm3, so Claude Code keeps its own login', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-shim-'));
    const real = path.join(root, 'real');
    mkdirSync(real);
    writeFileSync(path.join(real, 'mm3'), '#!/bin/sh\necho "dir=$CLAUDE_CONFIG_DIR args=$*"\n', { mode: 0o755 });
    const dir = shimMm3(real, '/fake/claude dir');
    const out = spawnSync(path.join(dir, 'mm3'), ['doctor'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(out.stdout.trim()).toBe('dir=/fake/claude dir args=doctor');
    expect(process.env.CLAUDE_CONFIG_DIR).not.toBe('/fake/claude dir'); // nothing leaked into this process
  });
});

describe('trials in the ledger [C-267]', () => {
  const spec = { full: [{ id: 'S1', title: 'Ask a plain question', goal: 'g', prompt: 'p', model: 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged'] }], rules: { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 } };
  const started = (o: Partial<StartedRecord> = {}): StartedRecord => ({ kind: 'trial', phase: 'started', schema: 2, id: 'TRL-0001', ts: '2026-10-06T09:00:00.000Z', version: 'local+abc1234', versionCommit: 'abc1234', head: 'abc1234', dirty: false, fingerprint: 'f', definition: definitionOf(spec, { tag: 't', sha: 's' }), mode: 'free', trialsOverride: 1, formal: false, formalReason: 'a development trial', ...o });
  const finished = (o: Partial<FinishedRecord> = {}): FinishedRecord => ({ kind: 'trial', phase: 'finished', startedId: 'TRL-0001', ts: 't', passed: true, level3: [{ id: 'S1', route: 'mcp', model: 'sonnet', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, transcript: 't' }], ...o });

  it('[C-267] trials and ceremonies are numbered separately and never reuse an id', () => {
    const c = started({ kind: 'ceremony', id: 'CER-0004' });
    expect(nextId([c], 'TRL')).toBe('TRL-0001');
    expect(nextId([c, started()], 'TRL')).toBe('TRL-0002');
    expect(nextId([c, started()])).toBe('CER-0005');
  });
  it('[C-267] a trial never feeds the release gate, even if it were marked formal', () => {
    expect(lastFormal([started({ formal: true }), finished()])).toBeUndefined();
  });
  it('[C-267] a trial is not held to the level 1 and level 2 results a ceremony has', () => {
    const gaps = recordGaps(started(), finished({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheCreationTokens: 1, turns: 1, claudeRuns: 1, mm3Calls: 1 }, decision: { verdict: 'SHIP', formal: false, blockers: [], exceptions: [], improvements: [] } }));
    expect(gaps.some((g) => /level 1|level 2|first-request/u.test(g))).toBe(false);
  });
  it('[C-267] the report calls a trial a trial, says it never counts toward the release gate, and shows paid spend', () => {
    const t = tellRun([started({ mode: 'paid', paid: { approvedUsd: 0.5 } }), finished({ spentUsd: 0.0123 })], 'TRL-0001', undefined).join('\n');
    expect(t).toContain('AGENTIC FEATURE TRIAL REPORT · TRL-0001 · MM3 local+abc1234');
    expect(t).toContain('a TRIAL of one job on a local build: recorded, and it never counts toward the release gate');
    expect(t).toContain('PAID run: $0.0123 of an approved $0.5 real TypeSafe spend');
    expect(t).toContain('TRIAL, a development check that never decides a release');
  });
});
