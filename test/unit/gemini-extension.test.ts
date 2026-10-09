// Gemini CLI's own manifest (gemini-extension.json at the package root): it must stay in step with package.json and start
// the same MCP server the Claude plugin manifest does, so a Gemini user gets the same MM3 through `gemini extensions install`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string): Record<string, unknown> => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
type Server = { command: string; args: string[] };

describe('gemini-extension.json', () => {
  const ext = read('gemini-extension.json');
  const pkg = read('package.json') as { version: string; files: string[] };

  it('carries the package version and a name', () => {
    expect(ext.name).toBe('mm3');
    expect(ext.version).toBe(pkg.version);
  });

  it('starts the same server as the plugin manifest: node bin/mm3.mjs mcp, from the extension folder', () => {
    const mine = (ext.mcpServers as { mm3: Server }).mm3;
    const claude = (read('.claude-plugin/plugin.json').mcpServers as { mm3: Server }).mm3;
    expect(mine.command).toBe(claude.command);
    expect(mine.args.map((a) => a.replace('${extensionPath}${/}', '').replaceAll('${/}', '/'))).toEqual(claude.args.map((a) => a.replace('${CLAUDE_PLUGIN_ROOT}/', '')));
  });

  it('ships in the npm package', () => {
    expect(pkg.files).toContain('gemini-extension.json');
  });
});
