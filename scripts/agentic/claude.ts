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
  turn?: number; // which model turn (in the order the stream shows them) asked for this call
}

/** One model turn, from the stream: what that turn read and wrote. Approximate (the stream reports it as it goes); the run's totals come from modelUsage and are exact. */
export interface TurnUsage {
  turn: number;
  agent: string; // 'lead' or the Agent call a helper belongs to
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** What a run used. A subscription has no per-call price, so the record counts tokens and model turns instead. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number; // model turns the lead took
}

export const noUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens, turns: a.turns + b.turns });

export interface ClaudeRun {
  calls: ClaudeCall[];
  answer: string;
  usage: Usage;
  turns: TurnUsage[];
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
  strict?: boolean; // deny anything not pre-approved (dontAsk): without it Claude Code lets read-only shell commands through whatever was approved
  env?: Record<string, string>;
  budgetUsd: number;
  timeoutMs?: number;
}

export function runClaude(o: ClaudeOptions): ClaudeRun {
  const args = ['-p', o.prompt, '--model', o.model, '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--max-budget-usd', String(o.budgetUsd), '--tools', (o.tools ?? []).join(',') || ''];
  if (o.system !== undefined) args.push('--system-prompt', o.system);
  if (o.allowedTools?.length) args.push('--allowedTools', ...o.allowedTools);
  if (o.strict) args.push('--permission-mode', 'dontAsk');
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
  const turns: TurnUsage[] = [];
  const seen = new Map<string, number>(); // message id → turn number: the stream repeats a message once per content block
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const id = String(e.message.id ?? `${turns.length}`);
    if (!seen.has(id)) {
      const u = (e.message.usage ?? {}) as Record<string, number>;
      seen.set(id, turns.length + 1);
      turns.push({ turn: turns.length + 1, agent: e.parent_tool_use_id ?? 'lead', inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheCreationTokens: u.cache_creation_input_tokens ?? 0 });
    }
    for (const b of e.message.content as Array<Record<string, any>>) {
      if (b.type === 'tool_use') calls.push({ tool: b.name, input: b.input ?? {}, parent: e.parent_tool_use_id ?? null, id: b.id, result: results[b.id] ?? '', turn: seen.get(id)! });
    }
  }
  // the LAST result: a lead that starts background helpers answers once before they report, then answers again when they do
  const final = [...events].reverse().find((e) => e.type === 'result');
  return {
    calls,
    answer: String(final?.result ?? ''),
    usage: usageOf(final),
    turns,
    model: typeof init?.model === 'string' ? init.model : null,
    plugins: (init?.plugins ?? []).map((p: { name: string }) => p.name),
    mcp: (init?.mcp_servers ?? []).map((m: { name: string; status: string }) => `${m.name}:${m.status}`),
    ok: final !== undefined && final.is_error !== true,
    ...(final === undefined ? { error: (r.stderr ?? '').slice(0, 300) || 'no result event' } : {}),
  };
}

/** Tokens across every model the run used (helpers included), from the result event's modelUsage. */
function usageOf(final: Record<string, any> | undefined): Usage {
  const u = noUsage();
  for (const m of Object.values((final?.modelUsage ?? {}) as Record<string, Record<string, number>>)) {
    u.inputTokens += m.inputTokens ?? 0;
    u.outputTokens += m.outputTokens ?? 0;
    u.cacheReadTokens += m.cacheReadInputTokens ?? 0;
    u.cacheCreationTokens += m.cacheCreationInputTokens ?? 0;
  }
  u.turns = Number(final?.num_turns ?? 0);
  return u;
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
