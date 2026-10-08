// relativeToCwd: the project folder shown relative to where the command ran, even when the OS spells that folder two ways
// (macOS: /var/… and /private/var/…; emulated here with a symlink).
import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { relativeToCwd } from '../../src/ledger/paths.ts';
import { tempProject } from '../helpers/project.ts';

describe('relativeToCwd', () => {
  it('is empty for the folder itself and plain for a folder below it', () => {
    const { root } = tempProject({});
    mkdirSync(path.join(root, 'sub'));
    expect(relativeToCwd(root, root)).toBe('');
    expect(relativeToCwd(root, path.join(root, 'sub'))).toBe('sub');
  });

  it.skipIf(process.platform === 'win32')('is empty when cwd is the real path of the folder and the root is spelled through a link', () => {
    const { root } = tempProject({});
    const link = `${root}-link`;
    symlinkSync(root, link);
    expect(relativeToCwd(root, link)).toBe('');
    expect(relativeToCwd(link, root)).toBe('');
  });
});
