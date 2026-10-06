// The one guidance text (src/help/guidance.ts) and every surface that carries it: the MCP `initialize` instructions
// (the lead agent, loaded only while the plugin is enabled), the shipped skill and the project guide (read by helpers),
// the conditional block `mm3 init --agents` writes, and the `mm3 agent delegate` card a lead pastes into helper prompts.
// It says WHEN and HOW to use MM3 (the funnel from the agent card, a pilot before volume), never a build sequence.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentsBlock } from '../../src/setup/agents-file.ts';
import { AGENT_POINTER, MM3_GUIDANCE } from '../../src/help/guidance.ts';
import { runAgent } from '../../src/help/agent.ts';
import { handleMessage } from '../../src/mcp/protocol.ts';

const body = (text: string): string[] => text.split('\n').slice(1);

describe('the guidance text [C-255]', () => {
  const lines = MM3_GUIDANCE.split('\n');

  it('[C-255] is short: at most 10 lines, none blank or over 260 characters, under 1,800 bytes (the MCP instructions cap is about 2 KB)', () => {
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines.every((l) => l.trim() !== '' && l.length <= 260)).toBe(true);
    expect(Buffer.byteLength(MM3_GUIDANCE, 'utf8')).toBeLessThanOrEqual(1800);
  });

  it('[C-255] has exactly one IMPORTANT line, so no single instruction is drowned out', () => {
    expect(lines.filter((l) => l.includes('IMPORTANT'))).toHaveLength(1);
    expect(lines[1]).toMatch(/^IMPORTANT: work top-down/u);
  });

  it('[C-255] says when and how: the funnel, a pilot first, gate: fail is normal, the probe card, run ids, delegation', () => {
    expect(MM3_GUIDANCE).toMatch(/`view`.*`scan`.*`drill`.*`loop`/u);
    expect(MM3_GUIDANCE).toMatch(/Known location: `class`/u);
    expect(MM3_GUIDANCE).toMatch(/Pilot first/u);
    expect(MM3_GUIDANCE).toMatch(/`gate: fail` is normal/u);
    expect(MM3_GUIDANCE).toMatch(/mm3 agent probe/u);
    expect(MM3_GUIDANCE).toMatch(/mm3 agent delegate/u);
    expect(MM3_GUIDANCE).toMatch(/judgment call about code or a design.*MM3 verdict.*fraction of a cent.*every run is recorded/u);
    expect(MM3_GUIDANCE).toMatch(/run id/u);
    expect(MM3_GUIDANCE).toMatch(/mm3 agent`/u);
    expect(MM3_GUIDANCE).toMatch(/mm3 agent <verb>/u);
  });

  it('[C-255] prescribes no build sequence: none of the old beats wording', () => {
    expect(MM3_GUIDANCE).not.toMatch(/\bbeats?\b|every one|\bKnow\b|\bJudge\b|\bProve\b/u);
  });
});

describe('every surface carries the same text [C-255]', () => {
  it('[C-255] the MCP initialize reply sends it as instructions, for every supported protocol version', async () => {
    for (const protocolVersion of ['2025-11-25', '2025-06-18', '1.0.0', undefined]) {
      const resp = await handleMessage(
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: protocolVersion ? { protocolVersion } : {} },
        { runOne: async () => ({ exit: 0, text: '' }), serverVersion: '0.0.0-test' },
      );
      expect((resp?.result as { instructions?: string }).instructions).toBe(MM3_GUIDANCE);
    }
  });

  it('[C-255] the block mm3 init --agents writes is conditional on the tool, and carries the same body', () => {
    expect(AGENT_POINTER.split('\n')[0]).toMatch(/^If the `mm3` tool is available/u);
    expect(body(AGENT_POINTER)).toEqual(body(MM3_GUIDANCE));
    expect(agentsBlock()).toContain(AGENT_POINTER);
  });

  it('[C-255] the shipped skill and the project guide carry the body, within the first 100 lines of the skill', () => {
    const skill = readFileSync('skills/mm3/SKILL.md', 'utf8');
    const head = skill.split('\n').slice(0, 100).join('\n');
    for (const line of body(MM3_GUIDANCE)) expect(head).toContain(line);
    const agents = readFileSync('AGENTS.md', 'utf8');
    for (const line of body(MM3_GUIDANCE)) expect(agents).toContain(line);
  });

  it('[C-255] the skill description covers analysis work, so it loads at the start of one', () => {
    const desc = /^description: (.+)$/mu.exec(readFileSync('skills/mm3/SKILL.md', 'utf8'))![1]!;
    expect(desc).toMatch(/analy/iu);
    expect(desc).toMatch(/audit/iu);
    expect(desc).toMatch(/architecture|port/iu);
  });
});

describe('mm3 agent delegate [C-256]', () => {
  const card = runAgent('delegate').text;

  it('[C-256] is a pasteable block: the guidance body plus what a helper must do', () => {
    expect(runAgent('delegate').exit).toBe(0);
    for (const line of body(MM3_GUIDANCE)) expect(card).toContain(line);
    expect(card).toMatch(/only the `mm3` MCP tool/u);
    expect(card).toMatch(/never read .mm3\/log\.jsonl/u);
    expect(card).toMatch(/what you did NOT run/u);
    expect(card).toMatch(/editing the output of `mm3 template <verb>`, not from scratch/u); // helpers' first hand-written requests often failed validation
  });

  it('[C-256] the overview points a lead at it', () => {
    expect(runAgent().text).toMatch(/run: mm3 agent delegate/u);
  });
});

describe('default surfaces carry no beats workflow', () => {
  for (const file of ['skills/mm3/SKILL.md', 'AGENTS.md']) {
    it(`${file} has no "every beat" workflow section`, () => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/Use MM3 in every beat/u);
      expect(text).not.toMatch(/use it in every one/u);
    });
  }
});
