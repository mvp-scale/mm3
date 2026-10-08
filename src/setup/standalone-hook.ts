/**
 * The plugin's nudge hook for the standalone single file. The npm plugin runs `node hooks/nudge.mjs`, which a
 * machine with no Node cannot do, so the standalone's plugin folder (setup/standalone.ts) names the file itself
 * instead: `<file> __hook`. This is not a command (it is absent from help, the agent cards and the usage line);
 * only the entrypoint in cli.ts looks for it. It runs the very same script: scripts/build-binary.ts embeds
 * hooks/nudge.mjs as plain CommonJS (`hooks/nudge.cjs`), so there is one source for the logic and both
 * channels print the same line, never block, and fail open. The script reads stdin and exits on its own.
 */
import { runInThisContext } from 'node:vm';
import { isStandalone, readPackageFile } from '../util/embedded.ts';

/** The one argument the hook command passes. */
export const HOOK_ARG = '__hook';

/** True when this process was launched as the standalone's hook (the argument is only honoured inside the binary). */
export const isHookLaunch = (argv: readonly string[]): boolean => isStandalone() && argv[2] === HOOK_ARG;

/** Runs the embedded nudge script in this process. Any failure of our own prints nothing and exits 0, like the script. */
export function runEmbeddedHook(): void {
  try {
    const code = readPackageFile('', 'hooks', 'nudge.cjs');
    // The script imports only node: built-ins, so its `require` is the built-in loader.
    const wrapper = runInThisContext(`(function (require, process) {${code}\n})`, { filename: 'mm3-nudge.cjs' }) as (r: (id: string) => unknown, p: NodeJS.Process) => void;
    wrapper((id) => process.getBuiltinModule(id as 'node:fs'), process);
  } catch {
    process.exit(0);
  }
}
