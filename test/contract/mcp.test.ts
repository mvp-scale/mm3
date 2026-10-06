// [C-103] the `mm3` MCP tool: name/input shape, runs exactly what `mm3 <args...>` would run in-process
// against the same request YAML, and returns the same text output plus the exit code as `isError`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { handleMessage, TOOL_NAME, toolDefinition, type JsonRpcRequest, type JsonRpcResponse, type RunOne } from '../../src/mcp/protocol.ts';
import { gitInit, tempProject } from '../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

/** The first (and, in these tests, only) run line in the project's ledger, parsed. */
function firstRun(root: string): { actor: string } {
  const line = readFileSync(path.join(root, '.mm3', 'log.jsonl'), 'utf8').trim().split('\n')[0]!;
  return JSON.parse(line) as { actor: string };
}

function fakeCtx(env: Record<string, string | undefined> = {}): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', ...env },
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    // The real repo root, not a placeholder: `template` reads skills/mm3/templates/*.yaml from here (see
    // src/verbs/template.ts's packageDir parameter) — a fixture placeholder would 404 that read for real.
    packageDir: process.cwd(),
    pkg: { name: 'mm3', version: '0.0.0-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}

function runOneFor(ctx: CliCtx): RunOne {
  return (args, stdin) => runCli(args, { ...ctx, stdin: () => Buffer.from(stdin ?? '', 'utf8') });
}

/** Drives the REAL `mm3 mcp` command (cli.ts's own `dispatch`, over real stdio streams — not a hand-rolled
 *  `runOne`): writes each message as one JSON-RPC line, closes stdin (so the server's own read loop resolves,
 *  same as a real client disconnecting), then parses whatever it wrote back, one response per line. */
async function runMcpOverStdio(ctx: CliCtx, messages: readonly JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (c: Buffer) => chunks.push(c));
  const done = runCli(['mcp'], { ...ctx, io: { input, output } });
  for (const m of messages) input.write(`${JSON.stringify(m)}\n`);
  input.end();
  await done;
  return Buffer.concat(chunks)
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as JsonRpcResponse);
}

describe('mcp protocol: tools/list', () => {
  it('lists exactly one tool named "mm3" with the {args, stdin} shape', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.result).toEqual({ tools: [toolDefinition()] });
    expect(TOOL_NAME).toBe('mm3');
  });

  it('[C-186] the tool description opens with the agent directive, before anything else', () => {
    const { description } = toolDefinition();
    expect(description).toMatch(/^First call args: \["agent"\] to learn the commands and rules/);
    expect(description).toContain('args: ["agent", "<command>"]');
  });
});

describe('mcp protocol: initialize', () => {
  it('echoes a supported requested protocolVersion back unchanged', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect((resp?.result as { protocolVersion?: string })?.protocolVersion).toBe('2025-11-25');
  });

  it('falls back to 2025-06-18 for an unsupported/missing requested version', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1.0.0' } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect((resp?.result as { protocolVersion?: string })?.protocolVersion).toBe('2025-06-18');
  });

  it('a notification (no id) — e.g. notifications/initialized — gets no response at all', async () => {
    const msg = { jsonrpc: '2.0', method: 'notifications/initialized' } as JsonRpcRequest;
    const resp = await handleMessage(msg, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp).toBeUndefined();
  });

  it('ping resolves to an empty result', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'ping' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.result).toEqual({});
  });
});

describe('mcp protocol: tools/call [C-103]', () => {
  it('doctor: the tool result text matches calling the CLI dispatch directly, isError false on exit 0', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['doctor'], ctx);
    const resp: JsonRpcResponse | undefined = await handleMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['doctor'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    expect(direct.exit).toBe(0);
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(false);
  });

  it('template class: same text as calling the CLI dispatch directly, no project needed', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['template', 'class'], ctx);
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['template', 'class'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(false);
  });

  it('agent class: same text as calling the CLI dispatch directly, no project needed [C-173]', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['agent', 'class'], ctx);
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['agent', 'class'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    expect(direct.exit).toBe(0);
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(false);
  });

  it('an unknown command: isError true, matching the CLI dispatch\'s own nonzero exit', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['not-a-real-command'], ctx);
    expect(direct.exit).not.toBe(0);
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['not-a-real-command'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(direct.text);
  });

  it('[C-103] a failing call that carried an unknown field (the YAML under "request") says it was ignored and that the YAML goes in "stdin"', async () => {
    const ctx = fakeCtx();
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], request: 'mak:\n  goal: x\n' } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('✖ arguments: ignored "request" → the tool takes only args, stdin and project');
    const ok = await handleMessage(
      { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['doctor'], note: 'extra' } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    expect((ok?.result as { content: Array<{ text: string }> }).content[0]?.text).not.toContain('ignored'); // a passing call is untouched
  });

  it('[C-103] the wrong field is checked before the request is read: a "-" call with no stdin stops once, names "stdin", ends with the pointer, and runs nothing', async () => {
    let ran = false;
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], request: 'mak:\n  goal: x\n' } } },
      { runOne: async () => { ran = true; return { exit: 2, text: '✖ request: empty → start with "mak:"' }; }, serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('✖ arguments: ignored "request" → the tool takes only args, stdin and project: the request YAML goes in "stdin" (args: ["class","-"])\n→ see: mm3 agent class');
    expect(ran).toBe(false);
  });

  it('[C-103] an unknown field next to a real stdin still runs the call; its own stop comes first, the ignored line next, one pointer last', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: 'x', yaml: 'x' } } },
      { runOne: async () => ({ exit: 2, text: '✖ request: x → y\n→ see: mm3 agent class' }), serverVersion: '0.0.0-test' },
    );
    const text = (resp?.result as { content: Array<{ text: string }> }).content[0]!.text;
    expect(text).toBe('✖ request: x → y\n\n✖ arguments: ignored "yaml" → the tool takes only args, stdin and project: the request YAML goes in "stdin" (args: ["class","-"])\n→ see: mm3 agent class');
  });

  it('[C-103] a stdin that is not text stops with that said, not with an empty request', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: { goal: 'x' } } } },
      { runOne: async () => ({ exit: 0, text: 'ran' }), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('✖ stdin: must be text, got object → send the request YAML as one string in stdin\n→ see: mm3 agent class');
  });

  it('[C-103] args that is not an array (a string with the YAML folded into it) stops with the fix instead of the generic help, and runs nothing', async () => {
    let ran = false;
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'mm3', arguments: { args: '["class","-"],\n"stdin":"mak:"' } } },
      { runOne: async () => { ran = true; return { exit: 0, text: 'ran' }; }, serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('✖ args: must be an array of strings, got string → args: ["class","-"] and the request YAML as the separate field stdin\n→ see: mm3 agent');
    expect(ran).toBe(false);
  });

  it('a request YAML on stdin (args: ["class", "-"]) with no project stops the same way the CLI would', async () => {
    const ctx = fakeCtx();
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: 'mak:\n  goal: x\n' } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const direct = await runCli(['class', '-'], { ...ctx, stdin: () => Buffer.from('mak:\n  goal: x\n', 'utf8') });
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(direct.exit !== 0);
  });

  it('an unknown tool name is a protocol-level error, not a tool result', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'not-mm3', arguments: { args: [] } } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect(resp?.error?.code).toBe(-32602);
  });

  // Fix #9: the plugin's own cwd is wherever Claude launched, which may not be the project — an optional
  // `project` argument (meaning MM3_HOME for that one call) lets a caller point at a nested project
  // without relying on cwd. [C-142]
  it('an optional project argument is advertised in the tool schema and passed through to runOne', async () => {
    expect((toolDefinition().inputSchema as { properties: Record<string, unknown> }).properties.project).toBeDefined();
    const calls: Array<[string[], string | undefined, string | undefined]> = [];
    const spy: RunOne = async (args, stdin, project) => {
      calls.push([args, stdin, project]);
      return { exit: 0, text: '' };
    };
    await handleMessage(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['doctor'], project: '/some/nested/project' } } },
      { runOne: spy, serverVersion: '0.0.0-test' },
    );
    expect(calls).toEqual([[['doctor'], undefined, '/some/nested/project']]);
  });

  it('project is undefined, not the empty string, when the caller omits it', async () => {
    const calls: Array<string | undefined> = [];
    const spy: RunOne = async (_args, _stdin, project) => {
      calls.push(project);
      return { exit: 0, text: '' };
    };
    await handleMessage(
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['doctor'] } } },
      { runOne: spy, serverVersion: '0.0.0-test' },
    );
    expect(calls).toEqual([undefined]);
  });

  it('an unrecognized method with an id is "method not found"', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'not/a/method' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.error?.code).toBe(-32601);
  });
});

const NODE_STOP_LINE = '✖ node: v20.11.0 is too old → install Node 22.13 or newer (it powers the ledger index); https://nodejs.org';

describe('the Node ≥ 22.13 guard (owner ruling) [C-106]', () => {
  it('a normal command exits 2 with the exact ✖ line on too old a Node — template needs no project either', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const r = await runCli(['template', 'class'], ctx);
    expect(r.exit).toBe(2);
    expect(r.text).toBe(`${NODE_STOP_LINE}\n→ see: mm3 agent template\n`);
  });

  it('a good Node runs the same command normally', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v22.13.0' };
    const r = await runCli(['template', 'class'], ctx);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('✖ node:');
  });

  it('doctor still runs on too old a Node (never a bare stop) but exits 2', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const r = await runCli(['doctor'], ctx);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('doctor:');
    expect(r.text).toContain('node: v20.11.0 ✖ too old → install Node 22.13+');
    expect(r.text).toContain('index: none (needs Node 22.13+)');
  });

  // These two run the REAL `mm3 mcp` command (cli.ts's own dispatch, not a hand-rolled runOne) over real
  // stdio streams — the version guard's mcp-specific wrapping lives inside that command's own branch, so
  // proving it needs the real loop, not protocol.ts's handleMessage in isolation.
  it('mm3 mcp still answers initialize and tools/list on too old a Node, over the real stdio loop', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const responses = await runMcpOverStdio(ctx, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    expect(responses[0]?.error).toBeUndefined();
    expect(responses[1]?.result).toEqual({ tools: [toolDefinition()] });
  });

  it('every tools/call is isError with the same ✖ line on too old a Node, whatever command was asked — doctor included, over the real stdio loop', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const responses = await runMcpOverStdio(ctx, [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['doctor'] } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['template', 'class'] } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['not-a-real-command'] } } },
    ]);
    expect(responses).toHaveLength(3);
    for (const resp of responses) {
      const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe(`${NODE_STOP_LINE}\n→ see: mm3 agent\n`);
    }
  });
});

describe('one ✖ prefix on the real mcp stdio path', () => {
  // Only the real `mm3 mcp` stdio loop exercises this: a thrown error must reach the client with its own
  // single "✖ field: ..." line, never re-wrapped as "✖ mm3: ✖ ...". [C-140]
  it('an outcome call on an unknown run id comes back with exactly one ✖, not two', async () => {
    const { root } = tempProject();
    const responses = await runMcpOverStdio(fakeCtx(), [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['outcome', 'MM3-9999', 'held', '--by', 'someone'], project: root } } },
    ]);
    const result = responses[0]?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('✖ outcome: MM3-9999 is not in the ledger → check the id with "mm3 view MM3-9999"\n→ see: mm3 agent outcome\n');
    expect(result.content[0]?.text.match(/✖/g)).toHaveLength(1);
  });
});

// An MCP-driven run used to record its actor from `git config user.name` in the project directory. When that
// happened to be the owner's own name (the common case), the owner's own "mm3 outcome <id> held --by
// <their name>" was refused by the self-held rule (ledger/log.ts's appendOutcome) — the owner couldn't mark the
// agent's own run held. Fix: an MCP-driven run now records "claude" instead, unless MM3_ACTOR is already
// set (which still wins, for either path). [C-143]
describe('MCP-driven runs get a real actor, not "agent" [C-143]', () => {
  it('no MM3_ACTOR set: an MCP-driven run records "claude"', async () => {
    const { root } = tempProject();
    const responses = await runMcpOverStdio(fakeCtx(), [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: CLASS_YAML, project: root } } },
    ]);
    const result = responses[0]?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(firstRun(root).actor).toBe('claude');
  });

  it('an explicit MM3_ACTOR still wins over the "claude" default', async () => {
    const { root } = tempProject();
    const responses = await runMcpOverStdio(fakeCtx({ MM3_ACTOR: 'reviewer-2' }), [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: CLASS_YAML, project: root } } },
    ]);
    const result = responses[0]?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(firstRun(root).actor).toBe('reviewer-2');
  });

  it('a plain (non-MCP) CLI run is unaffected: still defaults to "agent"', async () => {
    const { root } = tempProject();
    const ctx = fakeCtx();
    const r = await runCli(['class', '-'], { ...ctx, env: { ...ctx.env, MM3_HOME: root }, stdin: () => Buffer.from(CLASS_YAML, 'utf8') });
    expect(r.exit).toBe(0);
    expect(firstRun(root).actor).toBe('agent');
  });

  it('end to end: the owner can mark an MCP-driven run held under their own (git) name', async () => {
    const { root } = tempProject();
    gitInit(root); // configures user.name "mm3-test" — a stand-in for the owner's own git identity
    const classResp = await runMcpOverStdio(fakeCtx(), [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['class', '-'], stdin: CLASS_YAML, project: root } } },
    ]);
    expect((classResp[0]?.result as { isError: boolean }).isError).toBe(false);
    expect(firstRun(root).actor).toBe('claude');
    // Before the fix, the run above would have recorded actor "mm3-test" (this same git identity), and
    // this call would have been refused: the asker can't mark its own run held.
    const outcome = await runCli(['outcome', 'MM3-0001', 'held', '--by', 'mm3-test'], { ...fakeCtx(), env: { ...fakeCtx().env, MM3_HOME: root } });
    expect(outcome.exit).toBe(0);
    expect(outcome.text).toContain('held · by mm3-test');
  });
});
