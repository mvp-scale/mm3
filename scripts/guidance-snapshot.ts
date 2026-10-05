// `npm run guidance:accept`: rewrite the committed guidance snapshot and manifest from the code, on purpose, after
// reading the diff the drift test printed. Commit the result with the change, and re-run the agentic stage.
import { mkdirSync, writeFileSync } from 'node:fs';
import { collectSurfaces, manifestOf, renderSnapshot } from '../test/helpers/guidance-surfaces.ts';

const surfaces = collectSurfaces();
for (const [name, text] of Object.entries(surfaces)) {
  if (text.split('\n').some((l) => l.startsWith('=== '))) throw new Error(`surface ${name} has a line starting "=== ", which the snapshot uses as a separator`);
}
mkdirSync('test/golden/guidance', { recursive: true });
writeFileSync('test/golden/guidance/surfaces.txt', renderSnapshot(surfaces));
writeFileSync('test/golden/guidance/manifest.json', `${JSON.stringify(manifestOf(surfaces), null, 2)}\n`);
console.log(`guidance snapshot: ${Object.keys(surfaces).length} surfaces, fingerprint ${manifestOf(surfaces).fingerprint.slice(0, 16)}`);
