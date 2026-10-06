// The shipped plugin bundle (bin/mm3.mjs) driven the way Claude Code drives it: one long-lived `mm3 mcp` process,
// JSON-RPC lines over stdio, every command and verb through the one `mm3` tool. The other tiers run src/ or dist/;
// this is the file the plugin actually executes, on whatever Node runs the suite (the container matrix runs it on 22 and 24).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import { cliEnv } from '../../helpers/cli.ts';
import { tempProject, USER_TS } from '../../helpers/project.ts';

const BUNDLE = path.resolve('bin/mm3.mjs');
const fixture = (name: string): string => readFileSync(`test/fixtures/requests/valid/${name}.yaml`, 'utf8');

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

/** Starts `node bin/mm3.mjs mcp` in `root` and hands back `rpc` (one request, one response line) and `finish`. */
function startServer(root: string) {
  const child = spawn(process.execPath, [BUNDLE, 'mcp'], { cwd: root, env: cliEnv(root), stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
  let id = 0;
  const rpc = async (method: string, params?: unknown): Promise<{ result?: unknown; error?: { message: string } }> => {
    id += 1;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
    const next = await lines.next();
    if (next.done) throw new Error(`mm3 mcp closed before answering ${method}`);
    return JSON.parse(next.value as string) as { result?: unknown; error?: { message: string } };
  };
  const call = async (args: string[], stdin?: string): Promise<{ text: string; isError: boolean }> => {
    const resp = await rpc('tools/call', { name: 'mm3', arguments: { args, ...(stdin === undefined ? {} : { stdin }) } });
    const r = resp.result as ToolResult;
    return { text: r.content[0]?.text ?? '', isError: r.isError };
  };
  const finish = async (): Promise<{ code: number | null; stderr: string }> => {
    child.stdin.end();
    return { code: await exited, stderr };
  };
  return { rpc, call, finish, notify: (method: string) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`) };
}

describe('the plugin bundle over real MCP stdio', () => {
  it('handshake, then every command and verb through the one tool, with a clean stderr', async () => {
    const { root } = tempProject({ 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS });
    mkdirSync(path.join(root, '.mm3'), { recursive: true });
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 2\n  runs: 50\ndepth:\n  class: [3, 6, 9]\n');
    const s = startServer(root);

    const init = await s.rpc('initialize', { protocolVersion: '2025-06-18' });
    expect((init.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
    expect((init.result as { instructions?: string }).instructions).toMatch(/^MM3 is active here: .*\nIMPORTANT: work top-down/su); // the guidance, sent only while the plugin runs
    s.notify('notifications/initialized');
    const list = await s.rpc('tools/list');
    expect((list.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toEqual(['mm3']);
    expect(await s.rpc('ping')).toMatchObject({ result: {} });

    // Free commands: cards, help, templates, status.
    const ok = async (args: string[], stdin?: string, has?: RegExp): Promise<string> => {
      const r = await s.call(args, stdin);
      expect(r.isError, `${args.join(' ')} → ${r.text}`).toBe(false);
      if (has) expect(r.text).toMatch(has);
      return r.text;
    };
    await ok(['agent'], undefined, /view/);
    for (const verb of ['view', 'class', 'scan', 'loop', 'drill', 'replay']) await ok(['agent', verb], undefined, new RegExp(`verb: ${verb}`));
    await ok(['help']);
    await ok(['help', 'class']);
    for (const verb of ['view', 'class', 'scan', 'loop', 'drill', 'replay']) await ok(['template', verb]);
    await ok(['doctor']);
    await ok(['budget']);
    await ok(['config'], undefined, /budget:/);

    // The six verbs and outcome, on one ledger, in the order the contract test uses.
    await ok(['view', 'src'], undefined, /no runs yet/);
    await ok(['class', '-'], fixture('class'), /id: MM3-0001/);
    await ok(['view', '-'], fixture('view'));
    await ok(['outcome', 'MM3-0001', 'held', '--by', 'owner']);
    await ok(['replay', '--parent', 'MM3-0001', '--compare', 'worktree..worktree', '--expect', 'injection'], undefined, /recorded: \[parent\]/);
    const scan = await ok(['scan', '-'], fixture('scan'), /id: MM3-\d{4,}/);
    const scanId = /id: (MM3-\d{4,})/.exec(scan)![1]!;
    const drillReq = await ok(['template', 'drill', '--parent', scanId, '--from', 'src/handlers/user.ts/findUser']);
    await ok(['drill', '-'], drillReq);
    await ok(['loop', '-'], fixture('loop'));

    // Read-only report views and the ledger-wide knowledge reads.
    for (const view of ['hits', 'patterns', 'history', 'calls', 'problems', 'mdl']) await ok(['report', view]);
    await ok(['report', 'graph', 'category:injection']);

    // Config: validate and record the file.
    await ok(['config', '--load'], undefined, /valid/);
    await ok(['config'], undefined, /from config\.yaml/);

    // Stops are errors with one ✖ line and a fix, never a crash.
    for (const [args, stdin] of [
      [['class', '-'], 'mak:\n  goal: only a goal\n'],
      [['not-a-real-command'], undefined],
      [['class'], undefined],
      [['config', '--load', 'missing-file.yaml'], undefined],
    ] as const) {
      const r = await s.call([...args], stdin);
      expect(r.isError, args.join(' ')).toBe(true);
      expect(r.text.trimStart().startsWith('✖'), `${args.join(' ')} → ${r.text}`).toBe(true);
    }

    const { code, stderr } = await s.finish();
    expect(code).toBe(0);
    // No raw Node warning (node:sqlite experimental, deprecations) reaches the client's stderr on this Node.
    expect(stderr).not.toMatch(/ExperimentalWarning|DeprecationWarning|\(node:\d+\)/);
  }, 60_000);
});
