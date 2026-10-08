import { defineConfig } from 'vitest/config';

// Test tiers. `npm test` runs unit + contract + golden: no network, no build. cli spawns dist/cli.js;
// install and live run only from test/docker/test.sh or by hand.
// cli spawns the built binary a dozen times in one test, so it gets a longer timeout: a CPU-capped container
// (test/docker/test.sh) runs it 2-3x slower than a laptop and the 5 s default flakes.
// Hosted CI runners (Intel macOS, Windows, shared Linux) run 3-5x slower than a laptop and now and then stall for seconds:
// on CI every test gets at least 20 s, so a slow runner is not read as a failing test. Locally nothing changes.
const CI_FLOOR = process.env.CI ? 20_000 : 0;
const project = (name: string, include: string[], testTimeout?: number) => {
  const timeout = Math.max(testTimeout ?? 0, CI_FLOOR);
  return { test: { name, environment: 'node' as const, include, ...(timeout ? { testTimeout: timeout } : {}) } };
};

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
