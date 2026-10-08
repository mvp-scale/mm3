// The CLI run through a symlink, the way `npm install -g` and node_modules/.bin install it: `mm3` must print,
// never exit 0 silently because process.argv[1] is the link rather than dist/cli.js itself.
import { chmodSync, mkdtempSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MM3_BIN } from '../../helpers/cli.ts';

// Skipped on Windows: npm lays out .cmd shims there, not symlinks, and creating a symlink needs Developer Mode or an elevated user.
describe.skipIf(process.platform === 'win32')('mm3 through a symlink', () => {
  // MM3_BIN: the standalone binary is the one thing under test; it is run directly, not under node.
  const targets: Array<readonly [string, string]> = MM3_BIN ? [['the standalone binary', MM3_BIN]] : [['dist/cli.js', 'dist/cli.js'], ['bin/mm3.mjs (the plugin bundle)', 'bin/mm3.mjs']];
  for (const [label, target] of targets) {
    it(`${label}: help prints through a link, as a global npm install lays it out`, () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-link-'));
      const link = path.join(dir, 'mm3');
      symlinkSync(path.resolve(target), link);
      chmodSync(path.resolve(target), 0o755);
      const r = MM3_BIN ? spawnSync(link, ['help'], { encoding: 'utf8' }) : spawnSync(process.execPath, [link, 'help'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('MM3 turns a short numbered yes/no checklist');
    });
  }
});
