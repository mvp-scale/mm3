/**
 * The one guidance text. It says WHEN and HOW to use MM3 (the funnel from the agent card, a pilot before volume, how to
 * read a failing sweep, citing run ids), and never a build sequence: no "beats". A single string so every surface says
 * the same thing and a drift test (test/unit/guidance.test.ts) can pin them:
 *  - MM3_GUIDANCE: the MCP `initialize` reply's `instructions` (src/mcp/protocol.ts). Claude Code puts it in the lead
 *    agent's context only while the plugin is enabled, so disabling the plugin takes it away. Kept under 1,800 bytes
 *    because Claude Code reportedly truncates server instructions at about 2 KB.
 *  - AGENT_POINTER: the block `mm3 init --agents` writes into a project's AGENTS.md. The same body behind a conditional
 *    lead line, so it is inert if the plugin is later disabled; helper agents read project memory and skills, not MCP
 *    instructions.
 *  - the first 100 lines of skills/mm3/SKILL.md and the project guide carry the same body (the skill-docs test).
 * Plain English, markdown-safe (a lead line, then one IMPORTANT line, then "- " bullets), no blank lines.
 */
const BODY: readonly string[] = [
  'IMPORTANT: work top-down. Ask a few high-leverage questions per layer and drill only where MM3 flags something. "Exhaustive" means every layer covered through that funnel, not every file.',
  '- Open goal, in order: `view` (free reuse) → `scan` only when you do not know where to look → `drill` the flagged item → `loop` to check a design. Known location: `class` on the representative code.',
  '- Pilot first: send one small request, read the answer, fix the questions, then widen. Send no more than a few before you have read one.',
  '- A sweep that says `gate: fail` is normal (any file failing any concern fails it): read the failing categories and the `next:` line; do not stop and do not repeat it.',
  '- Before writing a request run `mm3 agent probe` (distinct roles per probe, a "none fits" option on every choice) and tag it with mdl (`uses`, `area`).',
  '- Before a judgment call about code or a design (safe to merge? is it fixed? which option?), get an MM3 verdict: a call costs a fraction of a cent and every run is recorded, so the next decision starts from evidence, not from scratch.',
  '- Cite the run id (MM3-####) for every claim that comes from MM3, and mark the rest as your own reading.',
  '- Delegating? Give helpers `mm3 agent delegate`, and check their reports against the ledger with `mm3 view MM3-####`: a helper can report work it did not do.',
];

const LEAD = 'Run `mm3 agent` first for the commands and rules, then `mm3 agent <verb>` before writing a request.';

/** The MCP `initialize` instructions. */
export const MM3_GUIDANCE: string = [`MM3 is active here: use it to ground analysis in evidence, not as an afterthought. ${LEAD}`, ...BODY].join('\n');

/** The block `mm3 init --agents` writes into a project's AGENTS.md (conditional on the tool being available). */
export const AGENT_POINTER: string = [`If the \`mm3\` tool is available, MM3 is active in this project. ${LEAD}`, ...BODY].join('\n');

/** The body alone, for the delegate card. */
export const GUIDANCE_BODY: readonly string[] = BODY;
