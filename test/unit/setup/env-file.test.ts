// ~/.config/mm3/env: a shell env file mm3 parses itself (never sources/evals), at 0600 in a 0700 dir.
// Only `export NAME='value'` for an allowed name is recognised; everything else — comments, other tools' lines
// — must survive untouched, since the owner's own real file on this machine is comments only.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_NAMES,
  canQuote,
  type EnvFileName,
  type EnvFileRead,
  envFilePath,
  looseFileModeWarning,
  readEnvFile,
  removeEnvFileValue,
  setEnvFileValue,
  mm3ConfigDir,
} from '../../../src/setup/env-file.ts';

function tmpEnv(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'mm3-envfile-')) };
}

describe('paths', () => {
  it('defaults to ~/.config/mm3 with no XDG_CONFIG_HOME', () => {
    expect(mm3ConfigDir({})).toBe(path.join(os.homedir(), '.config', 'mm3'));
    expect(envFilePath({})).toBe(path.join(os.homedir(), '.config', 'mm3', 'env'));
  });

  it('honours XDG_CONFIG_HOME', () => {
    const env = tmpEnv();
    expect(envFilePath(env)).toBe(path.join(env.XDG_CONFIG_HOME, 'mm3', 'env'));
  });
});

describe('readEnvFile', () => {
  it('undefined when there is no file', () => {
    expect(readEnvFile(envFilePath(tmpEnv()))).toBeUndefined();
  });

  it("comments and blanks are skipped, not counted as ignored", () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      ["# a hand-written template — comments only, as on the owner's own machine", '', "export TYPESAFE_API_KEY='k-1'", '# another comment', ''].join('\n'),
    );
    const read: EnvFileRead | undefined = readEnvFile(file);
    expect(read).toMatchObject({ values: { TYPESAFE_API_KEY: 'k-1' }, ignoredLines: 0 });
  });

  it('ALLOWED_NAMES is exactly the six names this format recognises', () => {
    const key: EnvFileName = 'TYPESAFE_API_KEY';
    expect(ALLOWED_NAMES).toContain(key);
    expect(ALLOWED_NAMES).toEqual(['TYPESAFE_API_KEY', 'AI_GATEWAY_API_KEY', 'TYPESAFE_BASE_URL', 'JEV_MODEL', 'JEV_GATEWAY_MODEL', 'MM3_PROVIDER']);
  });

  it('counts a non-comment line that does not parse, or names something outside the allowlist, as ignored', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, ["export TYPESAFE_API_KEY='k-1'", "export NOT_ALLOWED='x'", 'this is not an export line at all', ''].join('\n'));
    expect(readEnvFile(file)).toMatchObject({ values: { TYPESAFE_API_KEY: 'k-1' }, ignoredLines: 2 });
  });

  it('recognises every allowed name, not just the two key ones', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      [
        "export TYPESAFE_BASE_URL='https://proxy.example.com'",
        "export JEV_MODEL='jev-1.13.0'",
        "export JEV_GATEWAY_MODEL='typesafe-ai/jev'",
        "export MM3_PROVIDER='fake'",
      ].join('\n'),
    );
    expect(readEnvFile(file)).toMatchObject({
      values: {
        TYPESAFE_BASE_URL: 'https://proxy.example.com',
        JEV_MODEL: 'jev-1.13.0',
        JEV_GATEWAY_MODEL: 'typesafe-ai/jev',
        MM3_PROVIDER: 'fake',
      },
      ignoredLines: 0,
    });
  });
});

describe('canQuote', () => {
  it('false only for a value containing a literal single quote', () => {
    expect(canQuote('a-normal-key-value')).toBe(true);
    expect(canQuote("has-a-'-quote")).toBe(false);
  });
});

describe('setEnvFileValue: updates one line in place, never touches the rest', () => {
  // skipped on Windows: stat has no POSIX mode bits (it reports 0666), so 0600/0700 cannot be observed
  it.skipIf(process.platform === 'win32')('creates the file at 0600 in a 0700 dir when it does not exist yet', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    setEnvFileValue(file, 'TYPESAFE_API_KEY', 'brand-new-key');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(readFileSync(file, 'utf8')).toBe("export TYPESAFE_API_KEY='brand-new-key'\n");
  });

  it('replaces an existing line for the same name, leaving comments and other names untouched', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, ['# keep me', "export TYPESAFE_API_KEY='old-value'", "export MM3_PROVIDER='fake'", ''].join('\n'));
    setEnvFileValue(file, 'TYPESAFE_API_KEY', 'new-value');
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('# keep me');
    expect(text).toContain("export TYPESAFE_API_KEY='new-value'");
    expect(text).not.toContain('old-value');
    expect(text).toContain("export MM3_PROVIDER='fake'");
    expect(text.match(/TYPESAFE_API_KEY/gu)).toHaveLength(1); // never a duplicate line
  });

  it('appends when the name is not already there, and never duplicates on a second set', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "# only a comment\n");
    setEnvFileValue(file, 'AI_GATEWAY_API_KEY', 'g-1');
    setEnvFileValue(file, 'AI_GATEWAY_API_KEY', 'g-2');
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('# only a comment');
    expect(text).toContain("export AI_GATEWAY_API_KEY='g-2'");
    expect(text.match(/AI_GATEWAY_API_KEY/gu)).toHaveLength(1);
  });

  it('throws for a value containing a single quote, rather than writing something unparseable', () => {
    const env = tmpEnv();
    expect(() => setEnvFileValue(envFilePath(env), 'TYPESAFE_API_KEY', "has-a-'-quote")).toThrow(/single quote/u);
  });
});

describe('removeEnvFileValue', () => {
  it('removes only the named line, keeping comments and other names — "removed"', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, ['# keep me', "export TYPESAFE_API_KEY='k-1'", "export MM3_PROVIDER='fake'", ''].join('\n'));
    expect(removeEnvFileValue(file, 'TYPESAFE_API_KEY')).toBe('removed');
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('# keep me');
    expect(text).toContain("export MM3_PROVIDER='fake'");
    expect(text).not.toContain('TYPESAFE_API_KEY');
  });

  it('"absent" when the name was never there, or there is no file at all — never a throw', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    expect(removeEnvFileValue(file, 'TYPESAFE_API_KEY')).toBe('absent');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "# comments only, like the owner's real template\n");
    expect(removeEnvFileValue(file, 'TYPESAFE_API_KEY')).toBe('absent');
    expect(readFileSync(file, 'utf8')).toContain('comments only'); // untouched
  });

  it('removes the file itself only when literally nothing is left — never when a comment survives', () => {
    const env = tmpEnv();
    const file = envFilePath(env);
    setEnvFileValue(file, 'TYPESAFE_API_KEY', 'k-1');
    expect(removeEnvFileValue(file, 'TYPESAFE_API_KEY')).toBe('file-removed');

    const file2 = envFilePath(tmpEnv());
    mkdirSync(path.dirname(file2), { recursive: true });
    writeFileSync(file2, ['# a template the owner wants to keep', "export TYPESAFE_API_KEY='k-1'", ''].join('\n'));
    expect(removeEnvFileValue(file2, 'TYPESAFE_API_KEY')).toBe('removed');
    expect(readFileSync(file2, 'utf8')).toContain('# a template the owner wants to keep');
  });
});

describe('looseFileModeWarning', () => {
  it('quiet at 0600 or tighter, a ✖ line otherwise', () => {
    expect(looseFileModeWarning('/x/env', 0o600)).toBeUndefined();
    expect(looseFileModeWarning('/x/env', 0o400)).toBeUndefined();
    // Windows has no POSIX mode bits, so the warning is deliberately silent there (src/setup/env-file.ts)
    if (process.platform === 'win32') expect(looseFileModeWarning('/x/env', 0o644)).toBeUndefined();
    else expect(looseFileModeWarning('/x/env', 0o644)).toMatch(/^✖ credentials: \/x\/env is mode 644, looser than 0600/u);
  });
});
