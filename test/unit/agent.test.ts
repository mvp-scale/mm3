// mm3 agent [verb]: free, no project needed — help's terse, agent-facing twin. [C-173]
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_QUESTION_CHARS } from '../../src/contract/schema-check.ts';
import { VERBS } from '../../src/contract/types.ts';
import { AGENT_TOOLS, runAgent } from '../../src/help/agent.ts';
import { runHelp } from '../../src/help/index.ts';
import { PATTERNS } from '../../src/help/patterns.ts';
import { TOOL_LINE } from '../../src/help/report.ts';
import { PROBE_RULES, RULES, VERDICT_FACTS } from '../../src/help/rules.ts';
import { SHARP, VERB_LINE } from '../../src/help/verbs.ts';
import { tempProject } from '../helpers/project.ts';

describe('runAgent', () => {
  it('with no target: the verb list plus the universal rules, no prose', () => {
    const r = runAgent();
    expect(r.exit).toBe(0);
    expect(r.text).toContain('verbs (pick by goal):');
    for (const v of VERBS) expect(r.text).toContain(`- ${v}: `);
    expect(r.text).toContain('rules:');
    expect(r.text).not.toContain('##'); // no help-style headings
    expect(r.text).not.toContain('Sharp rules:'); // no help-style prose either
  });

  it.each(VERBS)('agent %s: the verb name, its own enforced rules, no prose', (verb) => {
    const r = runAgent(verb);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`verb: ${verb}`);
    expect(r.text).toContain('rules:');
    expect(r.text).not.toContain('When:');
    expect(r.text).not.toContain('Example:');
  });

  it('agent class and agent scan carry their own good/bad patterns, why-only', () => {
    expect(runAgent('class').text).toContain('patterns:');
    expect(runAgent('class').text).toContain('why:');
    expect(runAgent('scan').text).toContain('patterns:');
  });

  it('[C-183] agent view and agent loop now carry their own good/bad patterns too', () => {
    expect(runAgent('view').text).toContain('patterns:');
    expect(runAgent('loop').text).toContain('patterns:');
  });

  // Round-4 finding: `agent drill`/`agent replay` used to render an empty `rules:` section with no `patterns:`
  // at all — the two highest-stakes verbs had no in-band teaching surface. Both now carry SHARP's own gotcha
  // prose in `rules:` (verbs.ts) and at least one good/bad pair each (patterns.ts).
  it('[C-192] agent drill/replay now carry SHARP rules and a patterns section', () => {
    for (const verb of ['drill', 'replay'] as const) {
      const text = runAgent(verb).text;
      expect(text).toContain('patterns:');
      for (const s of SHARP[verb]) expect(text).toContain(s);
      const owned = PATTERNS.filter((p) => p.in.includes(verb));
      expect(owned.length).toBeGreaterThan(0);
      for (const p of owned) expect(text).toContain(p.why);
    }
  });

  it('[C-192] every verb card carries its own SHARP bullets, not just drill/replay', () => {
    for (const verb of VERBS) {
      const text = runAgent(verb).text;
      for (const s of SHARP[verb]) expect(text, `"${s}" missing from agent ${verb}`).toContain(s);
    }
  });

  it('an unknown target: a clean stop naming every verb', () => {
    const r = runAgent('nope');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ agent: "nope" is not a verb → /);
    for (const verb of VERBS) expect(r.text).toContain(verb);
  });

  it('a target with control characters: a clean stop', () => {
    expect(runAgent('a\u0000b').exit).toBe(2);
  });

  it('[C-181] agent with no target points explicitly at "mm3 agent probe", not just a verb', () => {
    expect(runAgent().text).toContain('mm3 agent probe');
  });

  it('[C-181] agent probe: the 8 probe rules, bare — no citations, no headings', () => {
    const text = runAgent('probe').text;
    expect(text).toContain('tool: probe');
    for (const r of PROBE_RULES) expect(text).toContain(r.text);
    expect(text).not.toContain('TypeSafe');
    expect(text).not.toMatch(/^##\s/mu);
  });

  // Round-4 finding: a cold agent hit `✖ question 1: is longer than 160 characters` with zero prior warning
  // in `agent view`/`agent probe` — the cap is now a shared RULES entry, tagged 'probe' too.
  it('[C-194] the 160-char question cap reaches agent probe and agent view (not just the validator)', () => {
    expect(runAgent('probe').text).toContain(String(MAX_QUESTION_CHARS));
    expect(runAgent('view').text).toContain(String(MAX_QUESTION_CHARS));
  });

  // Round-4 finding: an agent had to fail once (`✖ mak.where: cannot read "..."`) to learn `where:` resolves
  // against the MCP `project` arg/`MM3_HOME`, not session cwd — stated only in agent's overview.
  it('[C-195] the overview states where: resolves against project/MM3_HOME, not session cwd', () => {
    const text = runAgent().text;
    expect(text).toContain('MM3_HOME');
    expect(text).toContain('project');
    expect(text.toLowerCase()).toContain('session cwd');
    expect(text).toContain('run mm3 from inside the project');
    expect(text).toContain('never typed as a prefix on the command');
  });

  // [C-230] Cold-agent trial: "what changed between release A and B?" was answered with `git diff`, never replay.
  it('[C-230] the overview ties "what changed between releases or commits" to replay, and chains view → scan → drill → loop → replay', () => {
    const text = runAgent().text;
    expect(text).toMatch(/- replay: .*what changed between releases or commits/);
    expect(text).toMatch(/what changed or drifted between releases or commits: replay a prior run with compare: \{before: <ref>, after: <ref>\}/);
    expect(text).toContain('git diff is not an mm3 check');
    expect(text).toMatch(/view \(free reuse\) → scan \(find where\) → drill \(go deeper.*\) → loop \(check the design\) → replay/);
  });

  // [C-231] Cold-agent trial: speed-gain percentages with no answer behind them, and "no workarounds" after git diff.
  it('[C-231] the overview requires every reported number to cite an mm3 id or be labelled an estimate, and calls a non-mm3 check a workaround', () => {
    const text = runAgent().text;
    expect(text).toContain('every number or claim you report comes from an mm3 answer (cite its id, e.g. MM3-0042) or is labelled your own estimate');
    expect(text).toContain('a check done without mm3 (git diff, reading code to answer a question) is a workaround: say so; never claim none');
    expect(text).toContain('budget: … left is headroom, not a limit: stop only at ⚠ or exit 3');
  });

  // [C-269] Trial B1 (cli route): a chained heredoc-and-run shell command was refused and the agent stopped.
  it('[C-269] the overview says to save the request with a file tool and run one plain command, and that MCP takes it in stdin', () => {
    const text = runAgent().text;
    expect(text).toContain('start from `mm3 template <verb>`, save it with your file-write tool (not a shell heredoc or a chain of commands)');
    expect(text).toContain('then run one plain `mm3 <verb> <file> --dry-run` and then `mm3 <verb> <file>`');
    expect(text).toContain('through MCP the YAML goes in `stdin`');
  });

  // [C-276] Decision paths (TRL-0059, 0061): agents called a bare `view` first, and wrote `goal: \`file.ts\` ...`, which YAML cannot read.
  it('[C-276] the view bullet says it needs a request file, and the backtick advice says a value that starts with one must be quoted', () => {
    expect(runAgent().text).toContain('- view: free; what\'s already known for a request you wrote (mm3 view <request-file>), before any paid call');
    expect(runAgent('probe').text).toContain('a value that starts with a backtick must be in quotes');
  });

  // [C-196] The overview's closing run: block now has a third line pointing at the new verdict topic.
  it('[C-196] the overview points at "mm3 agent verdict" for reading a response', () => {
    expect(runAgent().text).toContain('run: mm3 agent verdict');
  });

  // [C-196] A new bare topic card covering the response-side vocabulary, aligned with help verdict's prose via
  // the shared VERDICT_FACTS list (rules.ts).
  describe('[C-196] agent verdict', () => {
    it('identifier, bare, no headings, no citations', () => {
      const text = runAgent('verdict').text;
      expect(text).toContain('tool: verdict');
      expect(text).not.toMatch(/^##\s/mu);
      expect(text).not.toContain('TypeSafe');
    });

    it('carries every VERDICT_FACTS entry, verbatim', () => {
      const text = runAgent('verdict').text;
      for (const f of VERDICT_FACTS) expect(text).toContain(f);
    });

    it('covers consensus, escalate, stale, reused and fixed/still/regressed', () => {
      const text = runAgent('verdict').text;
      for (const term of ['STRONG', 'SPLIT', 'WEAK', 'escalate', 'stale', 'reused', 'fixed', 'still', 'regressed', 'unsure']) {
        expect(text, `missing "${term}"`).toContain(term);
      }
    });

    it('is listed among the recognized extras', () => {
      const r = runAgent('nope');
      expect(r.text).toContain('"verdict"');
    });
  });

  it.each(['outcome', 'budget', 'report'] as const)('[C-182] agent %s: a recognized non-verb target, bare, with a good/bad pair', (target) => {
    const r = runAgent(target);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`tool: ${target}`);
    expect(r.text).toContain('patterns:');
    expect(r.text).not.toMatch(/^##\s/mu); // no help-style headings
  });

  it('[C-187] agent with no target lists a tools section, beyond the six verbs', () => {
    const text = runAgent().text;
    expect(text).toContain('tools:');
    for (const t of AGENT_TOOLS) expect(text).toContain(`- ${t}: `);
  });

  describe('[C-189] overview purpose lines: one each, shared verbatim with help', () => {
    it('every verb has exactly one purpose line in the overview, matching VERB_LINE', () => {
      const lines = runAgent().text.split('\n');
      for (const v of VERBS) {
        const matches = lines.filter((l) => l.startsWith(`- ${v}: `));
        expect(matches, `expected exactly one purpose line for verb ${v}`).toEqual([`- ${v}: ${VERB_LINE[v]}`]);
      }
    });

    it('every tool has exactly one purpose line in the overview, matching TOOL_LINE', () => {
      const lines = runAgent().text.split('\n');
      for (const t of AGENT_TOOLS) {
        const matches = lines.filter((l) => l.startsWith(`- ${t}: `));
        expect(matches, `expected exactly one purpose line for tool ${t}`).toEqual([`- ${t}: ${TOOL_LINE[t]}`]);
      }
    });

    it('help\'s own card states the same purpose text as agent\'s overview, for every verb and tool', () => {
      const helpText = runHelp().text;
      for (const v of VERBS) expect(helpText, `help card missing agent's ${v} line`).toContain(`- ${v}: ${VERB_LINE[v]}`);
      for (const t of AGENT_TOOLS) expect(helpText, `help card missing agent's ${t} line`).toContain(`${TOOL_LINE[t]}`);
    });
  });

  it('[C-187] agent template: a recognized non-verb tool, bare, with a good/bad pair', () => {
    const r = runAgent('template');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('tool: template');
    expect(r.text).toContain('patterns:');
    expect(r.text).not.toMatch(/^##\s/mu);
  });

  // Same shared rule list `help` uses (rules.ts) — never a second, divergent copy for the terse view.
  it('every validator rule tagged for a verb/card also appears verbatim in the matching agent output', () => {
    for (const rule of RULES) {
      for (const tag of rule.in) {
        if (tag === 'card') {
          expect(runAgent().text).toContain(rule.text);
        } else if ((VERBS as readonly string[]).includes(tag)) {
          expect(runAgent(tag).text, `"${rule.text}" missing from agent ${tag}`).toContain(rule.text);
        }
      }
    }
  });
});

// [C-190] The overview's own no-key hint: one extra `run:` line, only when no key is configured, using the
// same plugin-context detection doctor's `key:` line uses.
describe('runAgent: the overview\'s no-key hint', () => {
  it('with a key configured: no hint line at all', () => {
    const text = runAgent(undefined, { TYPESAFE_API_KEY: 'sk-real-key' }).text;
    expect(text).not.toContain('run: no key');
  });

  it('no key, outside the plugin: points at "mm3 init"', () => {
    const text = runAgent(undefined, {}).text;
    expect(text).toContain('run: no key → mm3 init to add one');
    expect(text).not.toContain('/plugin');
  });

  it('no key, inside the plugin (CLAUDE_PLUGIN_ROOT set): points at /plugin → MM3 → Configure', () => {
    const text = runAgent(undefined, { CLAUDE_PLUGIN_ROOT: '/plugins/mm3' }).text;
    expect(text).toContain('run: no key (sample answers only) → /plugin → MM3 → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration');
  });

  it('a verb card is never affected by env — no key info leaks into it', () => {
    const text = runAgent('class', {}).text;
    expect(text).not.toContain('run: no key');
  });

  it('a bad TYPESAFE_BASE_URL never crashes the overview — it just skips the hint', () => {
    expect(() => runAgent(undefined, { TYPESAFE_BASE_URL: 'not a url' })).not.toThrow();
  });
});

// Every card `agent` prints — the overview and each verb/tool — is built in one fixed shape: identifier
// line(s) first, then `rules:`, then `patterns:` (only when the target has any), then `run:` (only when it
// points further). [C-187]
describe('every agent card follows the same key order', () => {
  const NON_VERBS = ['probe', 'verdict', 'outcome', 'budget', 'report', 'template', 'config', 'doctor'] as const;

  /** 0 = an identifier line (verb:/verbs:/tool:/tools:, including the overview's "verbs (pick by goal):"
   *  header), 1 = rules:, 2 = patterns:, 3 = run: — undefined for any other line (a purpose/rule/pattern
   *  bullet, or bad/good body text), which carries no ordering constraint. */
  function tier(line: string): number | undefined {
    if (/^verbs?[: (]/.test(line) || /^tools?[: (]/.test(line)) return 0;
    if (line === 'rules:') return 1;
    if (line === 'patterns:') return 2;
    if (line.startsWith('run:')) return 3;
    return undefined;
  }

  const cards: readonly [string, string][] = [
    ['overview', runAgent().text],
    ...VERBS.map((v): [string, string] => [`verb ${v}`, runAgent(v).text]),
    ...NON_VERBS.map((t): [string, string] => [`tool ${t}`, runAgent(t).text]),
  ];

  it.each(cards)('%s: identifier, rules, patterns, run — never out of order', (_label, text) => {
    const tiers = text
      .split('\n')
      .map(tier)
      .filter((t): t is number => t !== undefined);
    expect(tiers.length).toBeGreaterThan(0);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!);
  });

  it('every non-verb card leads with "tool: <name>", matching verb cards\' "verb: <name>"', () => {
    for (const t of NON_VERBS) expect(runAgent(t).text.split('\n')[0]).toBe(`tool: ${t}`);
  });

  it('every verb card leads with "verb: <name>"', () => {
    for (const v of VERBS) expect(runAgent(v).text.split('\n')[0]).toBe(`verb: ${v}`);
  });
});

// `mm3 agent mdl`'s card is generated from mdl-fields.ts's MDL_FIELDS, or from a
// project's own EFFECTIVE (config-overridden) table when `deps.paths` names one with a `.mm3/config.yaml`
// `mdl:` override. Pinned exactly (no project) so any accidental drift in the card text is caught; a second
// test proves the override actually reaches the rendered card end to end, not just in mdl-fields.ts unit tests.
describe('runAgent("mdl"): the legend card', () => {
  it('with no project (or a project with no config override): pinned exactly to the built-in table', () => {
    const text = runAgent('mdl').text;
    expect(text).toBe(
      [
        'tool: mdl — optional, free, ≤25 lines. Flat keys; the only nesting is a list.',
        "Every field is optional: fill what you know, omit what doesn't apply.",
        '',
        'FIELDS',
        '  why      validate | find | debug',
        '  area     data | api | ui | auth | hosting | build | tests          (list ≤2; omit for whole-system questions: uses carries the map)',
        '  stage    design | build | review | pre-merge | post-fix | release | operate   (operate = live production/incident)',
        '  change   feature | fix | refactor | dependency | config   (only when a code change is involved)',
        '  risk     low | medium | high         the stakes if this answer is wrong',
        "  problem  one line ≤160: what you're solving, in your own words",
        '  uses     list ≤5 of chains (grammar below)',
        "  blast    person | system | container | component | code   the widest level one failure reaches (person = users' data or accounts)",
        '  touches  list ≤5 domain objects/fields (not concepts like "authentication", not language built-ins)',
        '  <other>  any kebab-case key: one line ≤160 or a list ≤5, recorded as-is',
        '  unknown  allowed as a value for any closed field',
        '',
        'ARCHITECTURE: the C4 model (c4model.com). Five levels, each inside the one above:',
        '',
        '  system: shop',
        '  └── container: web-app                      an app or data store',
        '  │   ├── component: orders-handler           a group of code inside a container',
        '  │   │   └── code: createOrder               your own function (not a built-in)',
        '  │   └── component: orders-dao',
        '  └── container: database',
        '  person: customer                             outside the system',
        '  system: payment-service                      an outside service is its own system',
        '',
        'WRITE IT FLAT',
        '  inside  →  parent/child in the name:  component:web-app/orders-handler',
        '  uses    →  ->  between parts:         a -> b -> c',
        '  guessed or not built yet  →  end any part with ?:  component:web-app/refunds?  system:email-service?',
        '',
        '  chain   :=  part ( " -> " part )*',
        '  part    :=  level ":" name ( "/" name )* [ "?" ]',
        '  level   :=  person | system | container | component | code',
        '  name    :=  lowercase kebab-case, or a code identifier at the code level',
        '',
        'EXAMPLE',
        '  mdl:',
        '    why: validate',
        '    problem: request input reaches a raw query in order creation',
        '    uses:',
        '      - person:customer -> container:web-app',
        '      - component:web-app/orders-handler -> component:web-app/orders-dao -> container:database',
        '    blast: container',
        '    touches: [Order, amount]',
      ].join('\n'),
    );
  });

  it('a project config.yaml override for risk (values + note) appears in the rendered card, end to end', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'mdl:\n  risk:\n    values: [minor, major, severe]\n    note: how bad if wrong, this project\'s own scale\n');
    const text = runAgent('mdl', {}, { paths }).text;
    expect(text).toContain('risk     minor | major | severe         how bad if wrong, this project\'s own scale');
    // every other field is unaffected by an override that only names risk.
    expect(text).toContain('why      validate | find | debug');
  });

  it('with no deps.paths at all: behaves exactly like before B1 (no project-config lookup attempted)', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'mdl:\n  risk:\n    values: [minor, major, severe]\n');
    // paths omitted: the override must never leak in even though a config.yaml exists on disk somewhere.
    expect(runAgent('mdl').text).not.toContain('minor | major | severe');
  });
});
