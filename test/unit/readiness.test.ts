// The readiness check's pure parts (scripts/readiness.ts): placeholder filling, reading a cell's marker lines back into
// L1/L2, and the table. The containers themselves are not run here; `npm run readiness` does that.
import { describe, expect, it } from 'vitest';
import { cellScript, fill, NODES, readCell, table, type Cell } from '../../scripts/readiness.ts';

const route = { name: 'plugin', steps: ['x marketplace add {src}', 'x install mm3@{name}'], list: 'x list', expect: 'mm3@{name}' };
const agent = { id: 'x', version: 'x --version', routes: [route] };

describe('readiness', () => {
  it('fills the folder, its name and the server command for each variant', () => {
    expect(fill('{src} {name}', '/mkt', 'primary')).toBe('/mkt mkt');
    expect(fill('{exe} {argv}', '/mkt', 'primary')).toBe('node /mkt/bin/mm3.mjs mcp');
    expect(fill('{exe} {argv}', '/mktl', 'failover')).toBe('/mktl/launcher/mm3-launch mcp');
    expect(fill('{jsoncmd}', '/mkt', 'primary')).toBe('["node","/mkt/bin/mm3.mjs","mcp"]');
  });

  it('reads L1 and L2 from the markers, and skips both when the agent does not boot', () => {
    const ok = '@@node v22.13.0\n@@boot 0 x 1.0\n@@step 0 0 added\n@@step 1 0 installed\n@@list\nmm3@mkt enabled\n@@end\n';
    expect(readCell(ok, route, '/mkt', 'primary')).toMatchObject({ boots: 'ok', l1: 'ok', l2: 'ok', node: 'v22.13.0', secondStart: false });
    const bad = readCell('@@node none\n@@boot 127 /usr/bin/env: node: No such file\n', route, '/mkt', 'primary');
    expect(bad).toMatchObject({ boots: 'fail', l1: 'skip', l2: 'skip' });
    expect(bad.firstError).toContain('No such file');
  });

  it('names the failing step, and counts a list that only matches on the second start', () => {
    const step = readCell('@@boot 0 x\n@@step 0 0 added\n@@step 1 1 Error: not found\n', route, '/mkt', 'primary');
    expect(step).toMatchObject({ l1: 'fail', l2: 'skip', firstError: 'Error: not found' });
    const slow = '@@boot 0 x\n@@step 0 0 a\n@@step 1 0 b\n@@list\nnothing yet\n@@end\n@@list2\nmm3@mkt connected\n@@end2\n';
    expect(readCell(slow, route, '/mkt', 'failover')).toMatchObject({ l2: 'ok', secondStart: true });
  });

  it('puts the failover second list only in the failover script, and hides node for the no-Node state', () => {
    expect(cellScript(NODES[0]!, agent, route, '/mktl', 'failover')).toContain('@@list2');
    expect(cellScript(NODES[0]!, agent, route, '/mkt', 'primary')).not.toContain('@@list2');
    expect(cellScript(NODES[0]!, agent, route, '/mkt', 'primary')).toContain('mv /usr/bin/node');
  });

  it('draws one row per agent route and variant and one column per Node state', () => {
    const cell = (nodeId: string, l1: Cell['l1']): Cell => ({ kind: 'cell', run: 'RDY-0001', ts: '', agent: 'x', agentVersion: '', route: 'plugin', variant: 'primary', node: '', nodeId, boots: 'ok', l1, l2: l1, fetched: false, secondStart: false, firstError: '', how: [], ms: 0 });
    const t = table([cell('none', 'fail'), cell('24', 'ok')], [NODES[0]!, NODES[5]!]);
    expect(t.split('\n')).toHaveLength(2);
    expect(t).toContain('x plugin primary');
    expect(t).toContain('L1+L2');
  });
});

describe('readiness summary', () => {
  const base = { kind: 'cell', run: 'RDY-0001', ts: '', agentVersion: '1.2.3', node: '', fetched: false, secondStart: false, firstError: '', how: [], ms: 0, variant: 'primary', route: 'plugin', boots: 'ok', l1: 'ok', l2: 'ok' } as const;
  const cell = (agent: string, variant: Cell['variant'], nodeId: string, over: Partial<Cell> = {}): Cell => ({ ...base, agent, variant, nodeId, ...over });

  it('calls an agent install-ready when 22.13 and 24 pass, and says where the failover is moot because the agent needs Node', async () => {
    const { summarize } = await import('../../scripts/readiness.ts');
    const cells = [
      ...['22.13', '24'].map((n) => cell('x', 'primary', n)),
      cell('x', 'failover', 'none', { boots: 'fail', l1: 'skip', l2: 'skip', agentVersion: "/usr/bin/env: 'node': No such file" }),
      ...['stock', '20', '22.12'].map((n) => cell('x', 'failover', n, { variant: 'failover' })),
    ];
    expect(summarize(cells)).toEqual([expect.objectContaining({ agent: 'x', version: '1.2.3', status: 'install-ready', route: 'plugin', failover: 'covered where the agent starts' })]);
  });

  it('marks an agent with no route as no-surface and one whose list cannot be read as install-only', async () => {
    const { summarize } = await import('../../scripts/readiness.ts');
    const none = cell('a', 'primary', '24', { route: 'none', boots: 'skip', l1: 'n/a', l2: 'n/a', firstError: 'no surface' });
    const g = ['22.13', '24'].map((n) => cell('g', 'primary', n, { l2: 'n/a' }));
    expect(summarize([none, ...g]).map((a) => [a.agent, a.status])).toEqual([['a', 'no-surface'], ['g', 'install-only']]);
  });
});
