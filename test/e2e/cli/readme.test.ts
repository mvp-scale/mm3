// Every command in README.md's Quickstart section is executed here, unmodified, against a real project.
// "mm3" isn't on PATH in this harness, so a tiny wrapper script stands in for the installed binary.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mm3Command } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

function quickstartCommands(): string[] {
  const readme = readFileSync('README.md', 'utf8');
  const fence = /```bash\n# mm3-quickstart\n([\s\S]*?)```/.exec(readme);
  if (!fence) throw new Error('README.md has no "# mm3-quickstart" fenced block');
  return fence[1]!.trim().split('\n').filter((l) => l.trim());
}

/** A `mm3` shim on PATH that execs the built binary, so README's literal commands run unmodified. */
function shimBin(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-bin-'));
  const [cmd, argv] = mm3Command([]);
  writeFileSync(path.join(dir, 'mm3'), `#!/bin/sh\nexec "${cmd}"${argv.map((a) => ` "${a}"`).join('')} "$@"\n`);
  chmodSync(path.join(dir, 'mm3'), 0o755);
  return dir;
}

// `mm3 template class` (skills/mm3/templates/class.yaml) names `src/handlers/user.ts` as its own
// worked example's where: — tempProject()'s own default (src/user.ts) doesn't match it, so this project needs
// that exact file to exist for "mm3 class review.yaml" (the template piped straight through) to find it.
const HANDLER_TS =
  'export function findUser(req, res) {\n  const id = req.query.id;\n  const sql = `SELECT * FROM users WHERE id = ${id}`;\n  db.query(sql, (err, rows) => {\n    if (err) return res.status(500).send(err.message);\n    res.json(rows[0]);\n  });\n}\n';

describe('README Quickstart, run for real', () => {
  it('every line exits 0, in order', () => {
    const { root } = tempProject({ 'src/handlers/user.ts': HANDLER_TS });
    const bin = shimBin();
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MM3_HOME: root, MM3_PROVIDER: 'fake', MM3_ACTOR: 'readme', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' };
    let combined = '';
    for (const line of quickstartCommands()) {
      const r = spawnSync('sh', ['-c', line], { cwd: root, env, encoding: 'utf8' });
      expect(r.status, `"${line}" failed:\n${r.stderr}`).toBe(0);
      combined += r.stdout;
    }
    // The README says this runs on the fake provider with no key set; `view` labels fake/chaos runs
    // "rehearsal" (src/verbs/view.ts), so that label showing up here proves the claim, not just asserts it.
    expect(combined).toContain('rehearsal');
  });
});
