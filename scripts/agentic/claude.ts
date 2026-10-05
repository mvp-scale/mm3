// One isolated headless Claude run, parsed. The agentic stage needs every run to start from the same bare state: no user
// settings or plugins, no skills, only the tools and the plugin (if any) the scenario names. Returns what the agent
// did (its tool calls, in order, with the parent each belongs to), what it answered, and what the run cost in quota terms.
import { spawnSync } from 'node:child_process';

export interface ClaudeCall {
  tool: string;
  input: Record<string, unknown>;
  parent: string | null; // null: the lead; otherwise the tool_use id of the Agent call that spawned this helper
  id: string;
  result: string;
}

export interface ClaudeRun {
  calls: ClaudeCall[];
  answer: string;
  costUsd: number;
  model: string | null; // the model id the run actually used (the alias `sonnet` or `haiku` resolves to one)
  plugins: string[];
  mcp: string[];
  ok: boolean;
  error?: string;
}

export interface ClaudeOptions {
  prompt: string;
  model: 'haiku' | 'sonnet';
  cwd: string;
  system?: string; // replaces the default system prompt (L2 only: a context test starts from nothing)
  tools?: string[]; // the tools that exist for the run; [] means none
  allowedTools?: string[]; // pre-approved (headless runs cannot ask)
  pluginDir?: string;
  env?: Record<string, string>;
  budgetUsd: number;
  timeoutMs?: number;
}

export function runClaude(o: ClaudeOptions): ClaudeRun {
  const args = ['-p', o.prompt, '--model', o.model, '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--max-budget-usd', String(o.budgetUsd), '--tools', (o.tools ?? []).join(',') || ''];
  if (o.system !== undefined) args.push('--system-prompt', o.system);
  if (o.allowedTools?.length) args.push('--allowedTools', ...o.allowedTools);
  if (o.pluginDir) args.push('--plugin-dir', o.pluginDir);
  else args.push('--strict-mcp-config');
  const r = spawnSync('claude', args, { cwd: o.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: o.timeoutMs ?? 600_000, env: { ...process.env, ...(o.env ?? {}) } });
  const events = (r.stdout ?? '').split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, any>];
    } catch {
      return [];
    }
  });
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const results: Record<string, string> = {};
  for (const e of events) {
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const b of e.message.content) if (b.type === 'tool_result') results[b.tool_use_id] = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
    }
  }
  const calls: ClaudeCall[] = [];
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    for (const b of e.message.content as Array<Record<string, any>>) {
      if (b.type === 'tool_use') calls.push({ tool: b.name, input: b.input ?? {}, parent: e.parent_tool_use_id ?? null, id: b.id, result: results[b.id] ?? '' });
    }
  }
  // the LAST result: a lead that starts background helpers answers once before they report, then answers again when they do
  const final = [...events].reverse().find((e) => e.type === 'result');
  return {
    calls,
    answer: String(final?.result ?? ''),
    costUsd: Number(final?.total_cost_usd ?? 0),
    model: typeof init?.model === 'string' ? init.model : null,
    plugins: (init?.plugins ?? []).map((p: { name: string }) => p.name),
    mcp: (init?.mcp_servers ?? []).map((m: { name: string; status: string }) => `${m.name}:${m.status}`),
    ok: final !== undefined && final.is_error !== true,
    ...(final === undefined ? { error: (r.stderr ?? '').slice(0, 300) || 'no result event' } : {}),
  };
}

const VERB_REQUESTS = new Set(['class', 'scan', 'drill', 'loop', 'view', 'replay']);

/** The MM3 verb requests each agent made, in order, and whether each was accepted (a verdict came back). Grouped by who made them. */
export function attemptsByAgent(calls: ClaudeCall[]): Array<{ who: string; outcomes: boolean[] }> {
  const by = new Map<string, boolean[]>();
  for (const c of calls) {
    const verb = Array.isArray(c.input.args) ? String(c.input.args[0]) : /mm3[^ ]*(?:@[^ ]+)? +([a-z]+)/u.exec(String(c.input.command ?? ''))?.[1];
    const isMm3 = c.tool.includes('mm3') || (c.tool === 'Bash' && /mm3/u.test(String(c.input.command ?? '')));
    if (!isMm3 || verb === undefined || !VERB_REQUESTS.has(verb)) continue;
    const accepted = /\bgate: (pass|fail|unsure)/u.test(c.result) || /\bid: MM3-\d+/u.test(c.result);
    const who = c.parent ?? 'lead';
    by.set(who, [...(by.get(who) ?? []), accepted]);
  }
  return [...by].map(([who, outcomes]) => ({ who, outcomes }));
}
