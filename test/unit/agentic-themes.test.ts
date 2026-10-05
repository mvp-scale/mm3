// The fixed vocabulary for grouping self-improvements [C-265]: never more than 25 themes, every improvement the harness can record
// maps to one or two of them, and the tags only group: they carry no weight in a decision.
import { describe, expect, it } from 'vitest';
import { CHECKPOINTS } from '../../scripts/agentic/checkpoints.ts';
import { THEME_LIMIT, THEMES, THEMES_OF, themesFor } from '../../scripts/agentic/themes.ts';

describe('improvement themes [C-265]', () => {
  it('[C-265] the vocabulary is closed: at most 25 themes, each with a plain label and where its fix lands', () => {
    expect(Object.keys(THEMES).length).toBeLessThanOrEqual(THEME_LIMIT);
    for (const [k, t] of Object.entries(THEMES)) {
      expect(k, k).toMatch(/^[a-z]+(-[a-z0-9]+)*$/u);
      expect(t.label.length, k).toBeGreaterThan(8);
      expect(t.where.length, k).toBeGreaterThan(4);
    }
    expect(THEMES.other).toBeDefined(); // the pressure valve exists
  });

  it('[C-265] every checkpoint, and every named pattern the decision records, maps to one or two themes from the list', () => {
    for (const id of [...Object.keys(CHECKPOINTS), 'first-request-rate', 'lower-tier-models']) {
      const themes = THEMES_OF[id];
      expect(themes, `${id} has no themes`).toBeDefined();
      expect(themes!.length, id).toBeGreaterThanOrEqual(1);
      expect(themes!.length, id).toBeLessThanOrEqual(2);
      for (const t of themes!) expect(THEMES[t], `${id} → unknown theme ${t}`).toBeDefined();
    }
  });

  it('[C-265] an improvement with no mapping is tagged `other`, never left out', () => {
    expect(themesFor('something-new')).toEqual(['other']);
    expect(themesFor('stays-on-mm3')).toEqual(['recovery-leaves-mm3', 'stop-next-command']);
  });
});
