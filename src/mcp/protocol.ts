/**
 * Pure JSON-RPC 2.0 message handling for the `mm3` MCP tool — no real I/O here (see stdio.ts for the
 * actual stdin/stdout loop, and cli.ts's `mcp` command for the wiring). One tool, `mm3`, runs exactly what
 * `mm3 <args...>` would run, in-process, with `stdin` standing in for the CLI's own stdin — there's no
 * second contract; the same YAML goes in and comes out. `toolDefinition`'s own description leads with a
 * directive rather than a description: a cold agent's first call should be `args: ["agent"]` (src/help/agent.ts),
 * since that's the only thing telling it `agent`/`template`/`report`/`outcome`/`budget` exist at all — the tool
 * description is the first and sometimes only text a fresh agent ever reads before its first call.
 *
 * Handshake: this implements the classic initialize/initialized flow (initialize, notifications/initialized,
 * tools/list, tools/call, ping), not the newest published MCP revision (2026-07-28), which drops the handshake
 * for a per-request `_meta` protocol-version scheme. That revision is brand new, and every real stdio MCP
 * client this plugin will actually talk to — including Claude Code's own — is expected to still speak the
 * classic handshake, so this is the interoperable choice: a deliberate, documented deviation from "the current
 * spec" read literally.
 */

import { MM3_GUIDANCE } from '../help/guidance.ts';

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Runs one `mm3 <args...>` call in-process; `stdin` stands in for fd 0 (e.g. a `-` positional).
 *  `project` stands in for `MM3_HOME` for this one call — the plugin's own cwd is wherever
 *  Claude launched, not necessarily the project, and there's no way to `cd` before an MCP tool call. */
export type RunOne = (args: string[], stdin?: string, project?: string) => Promise<{ exit: number; text: string }>;

const SUPPORTED_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'] as const;
const DEFAULT_VERSION = '2025-06-18';

export const TOOL_NAME = 'mm3';

const TOOL_FIELDS = ['args', 'stdin', 'project'];

/** The one tool this server exposes: same args/stdin as the CLI, same text + exit code back. */
export function toolDefinition(): { name: string; description: string; inputSchema: Record<string, unknown> } {
  return {
    name: TOOL_NAME,
    description:
      'First call args: ["agent"] to learn the commands and rules, then args: ["agent", "<command>"] before ' +
      'writing a request. Otherwise runs any mm3 CLI command in this project — the same arguments and ' +
      'stdin the mm3 CLI takes (e.g. args: ["class","-"], stdin: <request YAML>, or args: ["doctor"]). ' +
      'Returns the same text output mm3 would print, and marks the result an error when the exit code is not 0.',
    inputSchema: {
      type: 'object',
      properties: {
        args: { type: 'array', items: { type: 'string' }, description: 'mm3 CLI arguments, e.g. ["doctor"] or ["class","-"]' },
        stdin: { type: 'string', description: 'Text to feed as stdin, for a "-" argument (e.g. the request YAML).' },
        project: { type: 'string', description: 'The project directory to use (MM3_HOME), when it is not the current working directory.' },
      },
      required: ['args'],
    },
  };
}

const err = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });
const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });

/** One JSON-RPC message in, a response out — or undefined for a notification (no `id`), which never gets one,
 *  regardless of method name (that's the JSON-RPC 2.0 rule: absence of `id` is what makes it a notification). */
export async function handleMessage(msg: JsonRpcRequest, deps: { runOne: RunOne; serverVersion: string }): Promise<JsonRpcResponse | undefined> {
  const hasId = Object.hasOwn(msg, 'id') && msg.id !== undefined;
  if (!hasId) return undefined;
  const id = msg.id as string | number | null;
  const method = typeof msg.method === 'string' ? msg.method : undefined;
  if (!method || msg.jsonrpc !== '2.0') return err(id, -32600, 'Invalid Request');

  if (method === 'initialize') {
    const params = (msg.params ?? {}) as { protocolVersion?: unknown };
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined;
    const protocolVersion = requested && (SUPPORTED_VERSIONS as readonly string[]).includes(requested) ? requested : DEFAULT_VERSION;
    return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mm3', version: deps.serverVersion }, instructions: MM3_GUIDANCE });
  }

  if (method === 'ping') return ok(id, {});

  if (method === 'tools/list') return ok(id, { tools: [toolDefinition()] });

  if (method === 'tools/call') {
    const params = (msg.params ?? {}) as { name?: unknown; arguments?: { args?: unknown; stdin?: unknown; project?: unknown } };
    if (params.name !== TOOL_NAME) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
    const rawArgs = params.arguments?.args;
    const args = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
    const stdin = typeof params.arguments?.stdin === 'string' ? params.arguments.stdin : undefined;
    const project = typeof params.arguments?.project === 'string' ? params.arguments.project : undefined;
    try {
      const { exit, text } = await deps.runOne(args, stdin, project);
      // Agents sometimes put the request YAML under a field of their own ("request"); it is dropped, so the run's own
      // stop ("request: empty") would blame the wrong thing. A failing call says what was ignored and where the YAML goes.
      const ignored = Object.keys(params.arguments ?? {}).filter((k) => !TOOL_FIELDS.includes(k));
      const hint = exit !== 0 && ignored.length > 0 ? `\n✖ arguments: ignored ${ignored.map((k) => `"${k}"`).join(', ')} → the tool takes only args, stdin and project: the request YAML goes in "stdin" (args: ["class","-"])` : '';
      return ok(id, { content: [{ type: 'text', text: `${text}${hint}` }], isError: exit !== 0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return ok(id, { content: [{ type: 'text', text: `✖ mm3: ${message}` }], isError: true });
    }
  }

  return err(id, -32601, `Method not found: ${method}`);
}
