// Guidance drift [C-258]: every text an agent reads (MCP instructions, the AGENTS block, skill files, every `mm3 agent`
// and `mm3 help` card, every template, the MCP tool definition) is pinned to a committed snapshot. A change fails
// here with a readable diff and a guess at whether it is substantive (a command, flag or number moved) or a wording
// refinement. After reading it, `npm run guidance:accept` takes the change on purpose; the agentic stage then has to be
// re-run, because its result is bound to the fingerprint this test checks.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectSurfaces, describeDrift, manifestOf, parseSnapshot, renderSnapshot } from '../helpers/guidance-surfaces.ts';

const SNAPSHOT = 'test/golden/guidance/surfaces.txt';
const MANIFEST = 'test/golden/guidance/manifest.json';
const FIX = 'read the diff; if the change is intended run `npm run guidance:accept`, commit the snapshot with it, and re-run the agentic stage (npm run check:agentic)';

describe('guidance drift [C-258]', () => {
  const now = collectSurfaces();

  it('[C-258] every surface matches the committed snapshot', () => {
    const before = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
    const names = [...new Set([...Object.keys(before), ...Object.keys(now)])];
    const drift = names.filter((n) => before[n] !== now[n]).map((n) => describeDrift(n, before[n], now[n]));
    expect(drift.length, `guidance drift in ${drift.length} surface(s) → ${FIX}\n\n${drift.join('\n\n')}\n`).toBe(0);
  });

  it('[C-258] the manifest\'s fingerprint is the fingerprint of the current text', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as ReturnType<typeof manifestOf>;
    expect(manifestOf(now).fingerprint, `the manifest is stale → ${FIX}`).toBe(manifest.fingerprint);
    expect(renderSnapshot(now)).toBe(readFileSync(SNAPSHOT, 'utf8'));
  });

  it('[C-258] a one-word change is caught, and reverting it passes', () => {
    const before = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
    const changed = { ...now, 'mcp/instructions': now['mcp/instructions']!.replace('top-down', 'bottom-up') };
    const report = describeDrift('mcp/instructions', before['mcp/instructions'], changed['mcp/instructions']);
    expect(report).toContain('mcp/instructions');
    expect(report).toContain('wording refinement'); // no command, flag or number moved
    const flag = describeDrift('mcp/instructions', before['mcp/instructions'], now['mcp/instructions']!.replace('`view`', '`viewx`'));
    expect(flag).toContain('LIKELY SUBSTANTIVE'); // a backticked command changed
    expect(manifestOf(changed).fingerprint).not.toBe(manifestOf(now).fingerprint);
    expect(describeDrift('mcp/instructions', before['mcp/instructions'], now['mcp/instructions'])).toContain('wording refinement'); // unchanged text reports nothing removed or added
  });
});
