// An agent in a test has MM3 and nothing else [C-273]: the account's claude.ai connectors are switched off for every run, and a run
// that still had a server besides the plugin under test is not a result. Before this, a plugin run loaded the logged-in account's mail,
// drive, calendar and docs connectors some of the time (23 of 33 MCP sonnet trials passed with them present, 19 of 21 without), so one
// trial's tools and startup instructions differed from the next one's.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearAgentScratch } from '../../scripts/agentic/run.ts';
import { isolatedEnv, strayServers } from '../../scripts/agentic/claude.ts';

describe('agent runs are isolated from the account [C-273]', () => {
  it('[C-273] every run switches the claude.ai connectors off, and a caller's extra environment cannot switch them back on', () => {
    expect(isolatedEnv().ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false');
    expect(isolatedEnv({ MM3_PROVIDER: 'fake' })).toMatchObject({ ENABLE_CLAUDEAI_MCP_SERVERS: 'false', MM3_PROVIDER: 'fake' });
    expect(isolatedEnv({ ENABLE_CLAUDEAI_MCP_SERVERS: 'true' }).ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false'); // not even a caller's own value turns them back on
  });

  it('[C-273] the plugin under test is the only server an agent may have; anything else names the run as not a result', () => {
    expect(strayServers([])).toEqual([]);
    expect(strayServers(['plugin:mm3:mm3:connected'])).toEqual([]);
    expect(strayServers(['plugin:mm3:mm3:connected', 'claude.ai Gmail:connected', 'claude.ai Context7:pending'])).toEqual(['claude.ai Gmail:connected', 'claude.ai Context7:pending']);
  });

  it('[C-273] the scratch request folders an agent leaves in the temp folder are cleared before the next trial, and nothing else is', () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'mm3-scratch-test-'));
    for (const d of ['mm3-req', 'mm3req', 'mm3-req-2', 'mm3-agentic-project-abc', 'other']) mkdirSync(path.join(base, d));
    writeFileSync(path.join(base, 'mm3-req', 'login-class.yaml'), 'mak:\n');
    expect(clearAgentScratch(base).sort()).toEqual(['mm3-req', 'mm3-req-2', 'mm3req']);
    expect(readdirSync(base).sort()).toEqual(['mm3-agentic-project-abc', 'other']);
  });
});
