import { defineConfig } from 'vitest/config';

// Test tiers. `npm test` runs unit + contract + golden: no network, no build. cli spawns dist/cli.js;
// install and live run only from test/docker/test.sh or by hand.
// cli spawns the built binary a dozen times in one test, so it gets a longer timeout: a CPU-capped container
// (test/docker/test.sh) runs it 2-3x slower than a laptop and the 5 s default flakes.
const project = (name: string, include: string[], testTimeout?: number) => ({
  test: { name, environment: 'node' as const, include, ...(testTimeout ? { testTimeout } : {}) },
});

export default defineConfig({
  test: {
    maxWorkers: 4, // shared machine
    passWithNoTests: true,
    projects: [
      project('unit', ['test/unit/**/*.test.ts', 'src/**/*.test.ts']),
      project('contract', ['test/contract/**/*.test.ts']),
      project('golden', ['test/golden/**/*.test.ts']),
      project('cli', ['test/e2e/cli/**/*.test.ts'], 30_000),
      project('install', ['test/e2e/install/**/*.test.ts']),
      project('live', ['test/live/**/*.test.ts']),
    ],
  },
});
