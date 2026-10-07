// Node ≥ 22.13 is a hard requirement (owner ruling): cli.ts's dispatch checks this once, at the top, before
// any command but doctor/mcp does anything real. [C-106]
import { describe, expect, it } from 'vitest';
import { doctorNodeValue, DOCTOR_INDEX_TOO_OLD, nodeVersionOk, nodeVersionStop, parseNodeVersion } from '../../src/util/node-version.ts';

describe('parseNodeVersion', () => {
  it('parses a v-prefixed process.version string', () => {
    expect(parseNodeVersion('v22.13.0')).toEqual({ major: 22, minor: 13 });
  });

  it('parses a bare (no "v") version string too', () => {
    expect(parseNodeVersion('20.11.0')).toEqual({ major: 20, minor: 11 });
  });

  it('an unparseable string comes back undefined, not a throw', () => {
    expect(parseNodeVersion('not-a-version')).toBeUndefined();
    expect(parseNodeVersion('')).toBeUndefined();
  });
});

describe('nodeVersionOk [C-106]', () => {
  it('22.13.0 exactly is ok (the cutoff is inclusive)', () => {
    expect(nodeVersionOk('v22.13.0')).toBe(true);
  });

  it('22.12.x is not ok — the minor version is a real cutoff, not just the major', () => {
    expect(nodeVersionOk('v22.12.9')).toBe(false);
  });

  it('20.x is not ok', () => {
    expect(nodeVersionOk('v20.11.0')).toBe(false);
  });

  it('a newer major (24, 25, ...) is always ok regardless of its own minor', () => {
    expect(nodeVersionOk('v24.0.0')).toBe(true);
  });

  it('an unparseable version fails closed (never "ok")', () => {
    expect(nodeVersionOk('garbage')).toBe(false);
  });
});

describe('nodeVersionStop [C-106]', () => {
  it('undefined when the version is fine', () => {
    expect(nodeVersionStop('v22.13.0')).toBeUndefined();
  });

  it('the exact ✖ line, verbatim, on too old a Node', () => {
    expect(nodeVersionStop('v20.11.0')).toBe(
      '✖ node: v20.11.0 is too old → pin Node 22.13+ for this project (nvm, fnm or Volta; no machine-wide change); see https://github.com/mvp-scale/mm3',
    );
  });
});

describe('doctor-specific values [C-106]', () => {
  it('doctorNodeValue is the plain version when it is fine', () => {
    expect(doctorNodeValue('v22.13.0')).toBe('v22.13.0');
  });

  it('doctorNodeValue names the problem, compactly, when it is not', () => {
    expect(doctorNodeValue('v20.11.0')).toBe('v20.11.0 ✖ too old → pin Node 22.13+ for this project; see https://github.com/mvp-scale/mm3');
  });

  it('DOCTOR_INDEX_TOO_OLD is the exact index: value doctor shows on too old a Node', () => {
    expect(DOCTOR_INDEX_TOO_OLD).toBe('none (needs Node 22.13+)');
  });
});
