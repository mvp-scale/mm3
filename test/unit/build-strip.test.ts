// Unit tests for scripts/build-strip.ts (the README demo strip): the terminal's numbers come from the scene footer, the request opens folded and unfolds one group at a time under a simulated pointer, every beat is present, long lines wrap inside the viewport, the SVG is well-formed and script-free, its SMIL is consistent, the frozen poster is a complete frame, and the committed SVG is the build's output; no ledger, no network, no browser.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildStrip, extractStrip, freeCommands, stillHtml, stripData, stripGeometry, stripScene, stripTimeline } from '../../scripts/build-strip.ts';
// skipped on Windows: these build POSIX shell shims (#!/bin/sh) and a ':'-separated PATH, a Linux and macOS developer tool
const WINDOWS = process.platform === 'win32';


const scene = stripScene();
const svg = buildStrip(scene);

/** A small well-formedness check: every tag closes in order, attributes are quoted, no stray `&` or `<`. */
function wellFormed(xml: string): string | null {
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos);)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === '<' || m[0].startsWith('&')) return `stray ${m[0]} at ${m.index}`;
    if (m[2] === undefined) continue;
    if (m[2] === 'style' && !m[1]) { const end = xml.indexOf('</style>', re.lastIndex); re.lastIndex = end; }
    if (m[1]) { if (stack.pop() !== m[2]) return `unbalanced </${m[2]}> at ${m.index}`; }
    else if (!m[4]) stack.push(m[2]);
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}

const still = /<g class="still">([\s\S]*?)<\/g>\n<g class="motion">/.exec(svg)![1]!;
const motion = svg.slice(svg.indexOf('<g class="motion">'));

describe('build-strip', () => {
  it('reads the terminal numbers from the scene footer, not from typed text [the run is MM3-0008]', () => {
    const d = stripData(scene);
    expect(scene.id).toBe('MM3-0008');
    expect(scene.footer).toMatchObject({ questions: 12, latencyMs: 321, calls: 1, costEstimated: true });
    expect(d.receipt).toEqual(['12 questions · 1 call', '321 ms · ~$0.00006']);
    const other = { ...scene, footer: { ...scene.footer, questions: 33, latencyMs: 412, calls: 2, costUsd: 0.00096 } };
    expect(stripData(other).receipt).toEqual(['33 questions · 2 calls', '412 ms · ~$0.0010']);
    expect(d.next).toBe('next: drill into availability');
    expect([d.shell, d.ask, d.tool]).toEqual(['~/n8n $ claude', 'where would I make n8n faster?', 'mm3 class review.yaml']);
    for (const t of [d.receipt[0]!, d.receipt[1]!, d.next, d.ask, d.tool, 'Bash']) expect(motion).toContain(t);
    expect(svg).not.toMatch(/prompt shortened|the run itself is real|sending request/);
  });

  it('shows the real request, response and free output, byte for byte', () => {
    const d = stripData(scene);
    const req = scene.request.split('\n');
    const rebuilt = [...d.head, ...d.groups.flatMap((g) => [g.open, ...g.body])];
    expect(rebuilt).toEqual(req); // folding is a display: unfolded, every request line is back, in order
    expect(d.res.join('\n')).toBe(scene.response);
    expect(scene.title).toBe('Could symlink resolution and require-cache cleanup during unloadAll() be faster?');
    for (let q = 1; q <= 11; q++) expect(req.some((l) => new RegExp(`^ {8}${q}:`).test(l))).toBe(true);
    expect(scene.request).toMatch(/^mdl:\n {2}why: find/m); // this run sent a real mdl block
    expect(d.free.map((f) => f.cmd)).toEqual(['mm3 view MM3-0008', 'mm3 report mdl', 'mm3 view review.yaml']);
    expect(d.free[0]!.out).toContain('▶ MM3-0008 2026-09-29 class quick fail');
    expect(d.free[1]!.out).toContain('MM3-0008 class · why:find area:["build","hosting"] stage:operate');
    expect(d.free[2]!.out).toContain('reuse: MM3-0008');
    expect(d.free[2]!.out).toContain('notes: [free]');
    const plain = svg.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    const every = [...d.free.flatMap((f) => f.out.split('\n')), ...d.res, ...req];
    for (const line of every) if (line.trim()) expect(plain).toContain(line.trim().slice(0, 30)); // each line's start, however it wraps
  });

  it('opens the request folded: claim lines whole, concerns / decisions / mdl on one marked line each, counted from the request', () => {
    const d = stripData(scene);
    expect(d.head).toContain('  depth: quick');
    expect(d.head.join('\n')).toContain('goal: ' + scene.title);
    expect(d.head).toContain('    - packages/core/src/nodes-loader/directory-loader.ts:533-611');
    expect(d.groups.map((g) => g.fold)).toEqual(['    concerns: ▸ 3 concerns · 9 questions', '    decisions: ▸ 2 decisions', 'mdl: ▸ 7 fields']);
    expect(d.groups[2]!.body.filter((l) => /^ {2}[\w-]+:/.test(l))).toHaveLength(scene.knowledge.recorded.length); // 7 fields, as the response's `recorded` says
    const plainMotion = motion.replace(/<[^>]+>/g, '');
    for (const g of d.groups) expect(plainMotion).toContain(g.fold.trim());
    expect(motion).toContain('folded groups: collapsed to fit');
  });

  it('has every beat: the request tab pulses, the pointer clicks concerns, decisions, mdl, response and knowledge, the band walks, the value panel follows', () => {
    for (const w of ['>request<', '>response<', '>knowledge<']) expect(motion).toContain(w);
    expect(motion).toContain('id="pointer"');
    expect((motion.match(/class="ripple"/g) ?? []).length).toBe(5);
    expect(motion).toContain('class="band"');
    const bullets = ['One claim', 'Only your code', 'Fixed cost', 'Yes/no questions', 'Cheap models nail them', "When yes/no isn&apos;t enough", 'Why you asked', 'The ledger learns', 'Next time starts smarter', 'A verdict you can cite', 'Odds, not vibes', 'Finds where it breaks', 'Knows when to doubt itself', 'Tells you the next move', 'Every answer kept', 'Ask again: instant, free'];
    for (const b of bullets) expect(motion).toContain(b.replace('&apos;', "'"));
    for (const t of ['THE CLAIM', 'CONCERNS', 'DECISIONS', 'MDL', 'RESPONSE', 'NEXT', 'KNOWLEDGE']) expect(motion).toContain(`>${t}<`);
    expect(svg).not.toMatch(/class="(?:wire|pkt)"|<circle[^>]*class="dot"|caption/i); // no wire, no packet, no dots, no caption bar
    const tl = stripTimeline();
    const beats = [tl.bandA, tl.openCon, tl.openDec, tl.openMdl, tl.respIn, tl.r2, tl.r3, tl.knowIn, tl.k2, tl.k3, tl.end];
    beats.slice(1).forEach((b, i) => expect(b - beats[i]!).toBeGreaterThanOrEqual(4.2)); // every state is held long enough to read
    expect(tl.fire).toBeLessThan(tl.reqIn); // the tab pulses before the request appears
    expect(tl.clickCon).toBeLessThan(tl.openCon);
    expect(tl.T).toBeGreaterThan(tl.end);
  });

  it('keeps every line on one row, and fades long lines out at the viewport\'s right edge', () => {
    const d = stripData(scene);
    const g = stripGeometry(scene);
    expect(g.resRows).toBe(d.res.length); // one row per source line: nothing wraps
    expect(g.headRows).toBe(d.head.length);
    expect(svg).toMatch(/<mask id="fm"[^>]*><rect[^>]*fill="url\(#fg\)"/); // the fade, on the motion copy
    expect(svg).toMatch(/<g clip-path="url\(#vp\)" mask="url\(#fm\)">/);
  });

  it('sizes the viewport to the tallest document, so every document fits whole and nothing scrolls', () => {
    const g = stripGeometry(scene);
    expect(g.viewRows).toBe(Math.max(g.reqRows, g.resRows, g.knowRows));
    expect(g.resRows).toBeLessThanOrEqual(g.viewRows);
    expect(g.knowRows).toBeLessThanOrEqual(g.viewRows);
    expect(g.height).toBeLessThanOrEqual(720);
    expect(g.height).toBeGreaterThanOrEqual(480);
    expect(Number(/<svg [^>]*height="(\d+)"/.exec(svg)![1])).toBe(g.height);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="900"')).toBe(true);
  });

  it('is well-formed XML with no script, external font or machine path', () => {
    expect(wellFormed(svg)).toBeNull();
    expect(svg).not.toMatch(/<script|@import|@font-face|https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toMatch(/\/home\/|\/Users\/|[A-Z]:\\|\.superpowers|\/tmp\/|mm3-demo-play|<path>/);
    expect(readFileSync('site/scenes/strip-n8n.json', 'utf8')).not.toMatch(/\/home\/|\/Users\/|-play\b|\/tmp\/|<path>/);
  });

  it('animates with SMIL whose keyTimes, values and keySplines agree, and loops once with one fade at the seam', () => {
    const anims = [...svg.matchAll(/<animate(?:Transform)? ([^>]*?)\/>/g)].map((m) => m[1]!);
    expect(anims.length).toBeGreaterThan(60);
    for (const a of anims) {
      const values = /values="([^"]*)"/.exec(a)![1]!.split(';');
      const times = /keyTimes="([^"]*)"/.exec(a)![1]!.split(';').map(Number);
      expect(times).toHaveLength(values.length);
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(1);
      for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
      if (a.includes('calcMode="spline"')) expect(/keySplines="([^"]*)"/.exec(a)![1]!.split(';')).toHaveLength(values.length - 1);
      else expect(a).toContain('calcMode="discrete"');
      expect(a).toContain(`dur="${stripTimeline().T}s"`);
      expect(a).toContain('repeatCount="indefinite"');
    }
    expect(motion).toContain('class="seam"'); // the one fade at the loop seam
    expect(svg.match(/class="seam"/g)).toHaveLength(1);
    expect(anims.filter((a) => a.includes('attributeName="transform"')).length).toBeGreaterThanOrEqual(4); // the pointer and the request groups glide
    expect(motion).toMatch(/attributeName="height"/); // groups expand and fold with an eased height
  });

  it('draws a complete poster: a frozen copy for reduced motion, and the animated copy\'s own base state is the same frame', () => {
    expect(svg).toContain('@media (prefers-reduced-motion:reduce){.motion{display:none}.still{display:inline}}');
    expect(svg).toContain('.still{display:none}');
    expect(still).not.toMatch(/<animate/); // frozen: no motion
    for (const m of still.matchAll(/ id="([^"]+)"/g)) expect(m[1]!.endsWith('p')).toBe(true); // its own fade and clip ids carry a p, so none clash with the motion copy's
    for (const t of ['MM3-0008', '12 questions · 1 call', '321 ms · ~$0.00006', 'next: drill into availability', 'RESPONSE', 'A verdict you can cite', 'Odds, not vibes', 'Finds where it breaks']) expect(still).toContain(t);
    expect(still).toContain('font-weight="700" fill="#9bdcff" opacity="1"'); // the response tab is lit
    expect(still).not.toContain('id="pointer"'); // no pointer in the poster
    expect(readFileSync('docs/assets/demo-strip-n8n.svg', 'utf8')).toContain('<g class="still">');
    expect(wellFormed(stillHtml(svg, 3).replace(/^[\s\S]*?(<svg)/, '$1').replace(/<script>[\s\S]*$/, ''))).toBeNull();
  });

  it('matches the committed docs/assets/demo-strip-n8n.svg', () => {
    expect(readFileSync('docs/assets/demo-strip-n8n.svg', 'utf8').trimEnd()).toBe(svg);
  });
});

describe('extractStrip', () => {
  const play = (goal: string, withBin = false): { dir: string; req: string; out: string } => {
    const dir = mkdtempSync(path.join(tmpdir(), 'strip-play-'));
    mkdirSync(path.join(dir, 'n8n', '.mm3'), { recursive: true });
    const q = 'Is it fast?';
    const row = { kind: 'run', id: 'MM3-0008', verb: 'class', goal: 'g1', commit: 'abcdef1234', model: 'm', baseURL: 'https://api.example.test', costUsd: 0.00005, ask: { categories: [{ questions: [{ text: q }] }] }, telemetry: [{ source: 'provider', questions: 1, latencyMs: 9, costUsd: 0.00005, costEstimated: true }], response: `mak:\n  id: MM3-0008\n  note: see ${dir}/n8n/x.ts\nnext: mm3 template drill --from a\n` };
    writeFileSync(path.join(dir, 'n8n', '.mm3', 'log.jsonl'), JSON.stringify(row) + '\n');
    const req = path.join(dir, 'req.yaml');
    writeFileSync(req, `mak:\n  goal: ${goal}\n  ask:\n    concerns:\n      a:\n        1: ${q}\n`);
    if (withBin) {
      mkdirSync(path.join(dir, 'bin'));
      writeFileSync(path.join(dir, 'bin', 'mm3'), `#!/bin/sh\necho "mm3 $1 $2 at ${dir}/n8n/y.ts"\n`);
      chmodSync(path.join(dir, 'bin', 'mm3'), 0o755);
    }
    return { dir, req, out: path.join(dir, 'strip.json') };
  };

  it('freezes a ledger row and its request into a scene, with machine paths scrubbed', () => {
    const { dir, req, out } = play('g1');
    const s = extractStrip(dir, 'MM3-0008', req, out);
    expect(s).toMatchObject({ id: 'MM3-0008', verb: 'class', footer: { questions: 1, latencyMs: 9, endpoint: 'api.example.test' }, free: [] });
    expect(readFileSync(out, 'utf8')).not.toContain(dir);
    expect(s.response).toContain('<path>');
  });

  it.skipIf(WINDOWS)('captures the free view / report output of the play area, scrubbed, and refuses a failing command', () => {
    const { dir, req, out } = play('g1', true);
    const s = extractStrip(dir, 'MM3-0008', req, out, true);
    expect(s.free.map((f) => f.cmd)).toEqual(freeCommands('MM3-0008', req).map((c) => c.show));
    expect(s.free[0]!.out).toBe('mm3 view MM3-0008 at <path>');
    expect(readFileSync(out, 'utf8')).not.toContain(dir);
    const none = play('g1');
    expect(() => extractStrip(none.dir, 'MM3-0008', none.req, none.out, true)).toThrow(/bin\/mm3 not found/);
  });

  it('refuses a request file that is not the run\'s own', () => {
    const { dir, req, out } = play('another goal');
    expect(() => extractStrip(dir, 'MM3-0008', req, out)).toThrow(/goal does not match/);
    expect(() => extractStrip(dir, 'MM3-0099', req, out)).toThrow(/no run MM3-0099/);
  });
});
