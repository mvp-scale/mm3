/** Request text → a validated Request for one verb, or the exit-2 answer listing what to change (at most 5 stops). */
import { readRequestText } from '../contract/read.ts';
import type { Request, Verb } from '../contract/types.ts';
import { validateRequest, type ContractLimits } from '../contract/validate.ts';
import type { MdlField } from '../contract/mdl-fields.ts';
import type { Mm3Config } from '../config/defaults.ts';
import type { VerbResult } from './types.ts';

const MAX_STOPS = 5;

/** `stopText` also serves the four tools beyond the six verbs (report/outcome/budget/template) — none of them
 *  is a `Verb` (none takes `ask:`, none calls the classifier), so this widens just enough to name them too,
 *  without `verbs/` importing `help/agent.ts`'s `AGENT_TOOLS` just for a type. Not exported: every caller passes
 *  a plain verb/tool-name string literal and relies on structural typing, so nothing outside this file needs
 *  the type by name. */
type AgentTarget = Verb | 'report' | 'outcome' | 'budget' | 'template';

/** At most 5 stops, then one line saying how many more (pasted junk must not flood an agent's context), then a
 *  pointer at that verb/tool's own agent card — every stop is a knowledge gap `mm3 agent <target>` can
 *  close, not just the field it names. A stop is read by an agent, not a person at a terminal, so it points at
 *  the terse agent view (`mm3 agent`), not the prose `mm3 help`. Empty input (never a real call site
 *  today — every caller already guards on its own failure check) stays empty, no bare pointer line. */
export function stopText(stops: readonly string[], verb: AgentTarget): string {
  if (!stops.length) return '';
  const lines = stops.length <= MAX_STOPS ? [...stops] : [...stops.slice(0, MAX_STOPS), `✖ request: ${stops.length - MAX_STOPS} more problems → fix the ones above, then run again`];
  return [...lines, `→ see: mm3 agent ${verb}`].join('\n');
}

/** `mdlFields`: the caller's effective (project `.mm3/config.yaml` `mdl:`-aware) field
 *  table — build it once via `effectiveMdlFields(resolveConfig(paths, env).config.mdl)` and pass it in;
 *  omitted, this validates against the built-in table only (the pre-B1 behavior every existing caller keeps).
 *  `limits`: the project's depth tiers and item caps for this verb — build it with `contractLimits(cfg, verb)`;
 *  omitted, the built-in defaults. */
export function loadRequest(text: string, verb: Verb, mdlFields?: readonly MdlField[], limits?: ContractLimits): { ok: true; request: Request; notes: string[] } | { ok: false; result: VerbResult } {
  const read = readRequestText(text);
  if (!read.ok) return { ok: false, result: { exit: 2, text: stopText(read.stops, verb) } };
  const v = validateRequest(read.value, verb, text, mdlFields, limits);
  if (!v.ok) return { ok: false, result: { exit: 2, text: stopText(v.stops.map((s) => s.text), verb) } };
  return { ok: true, request: v.request, notes: v.notes };
}

/** The config's say over the request contract's counts, for one verb: its depth tiers (class, scan and loop have
 *  their own; view drafts a class request, so it follows class; drill and replay have none) and the items-per-layer
 *  caps. Pure: hand it a resolved config. */
export function contractLimits(cfg: Mm3Config, verb: Verb): ContractLimits {
  const tiers = verb === 'class' || verb === 'scan' || verb === 'loop' ? cfg.depth[verb] : verb === 'view' ? cfg.depth.class : undefined;
  return { ...(tiers ? { depth: tiers } : {}), itemsPerLayer: cfg.sweep.itemsPerLayer };
}
