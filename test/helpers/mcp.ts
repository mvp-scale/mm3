// The shipped plugin bundle (bin/mm3.mjs) driven the way Claude Code drives it: one `mm3 mcp` process, JSON-RPC lines over
// stdio, a list of calls to the one `mm3` tool. Shared by the e2e tests that compare the terminal with MCP.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { cliEnv } from './cli.ts';

const BUNDLE = path.resolve('bin/mm3.mjs');

/** One `mm3 mcp` process in `root`; `call` is the `mm3` tool, `instructions` the handshake's guidance text. */
export async function overMcp(root: string, calls: Array<{ args: string[]; stdin?: string; extra?: Record<string, unknown> }>): Promise<{ instructions: string; texts: string[]; errors: boolean[] }> {
  const child = spawn(process.execPath, [BUNDLE, 'mcp'], { cwd: root, env: cliEnv(root), stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const rpc = async (method: string, params?: unknown): Promise<{ result?: Record<string, unknown> }> => {
    id += 1;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
    const next = await lines.next();
    return JSON.parse(next.value as string) as { result?: Record<string, unknown> };
  };
  const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const texts: string[] = [];
  const errors: boolean[] = [];
  for (const c of calls) {
    const r = await rpc('tools/call', { name: 'mm3', arguments: { args: c.args, ...(c.stdin === undefined ? {} : { stdin: c.stdin }), ...(c.extra ?? {}) } });
    const res = r.result as { content: Array<{ text: string }>; isError?: boolean };
    texts.push(res.content[0]?.text ?? '');
    errors.push(res.isError === true);
  }
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  return { instructions: String(init.result?.instructions ?? ''), texts, errors };
}
