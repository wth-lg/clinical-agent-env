// The Full writeup (docs/writeup.html, built by scripts/docs-gen.ts) passes the two axe rules it
// failed in the P25u closing pass (verifier-1 addendum 3): every link colour meets 4.5:1 against
// the page and the table cards in light and in dark (WCAG 1.4.3), and every table scroll box can
// take keyboard focus and has a name, and every code block takes focus (axe
// scrollable-region-focusable).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate, WRITEUP } from '../docs-gen.ts';
import { repoRoot } from './helpers.ts';

type Rgb = [number, number, number];
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function toLinear(value: string): Rgb {
  const v = value.trim().toLowerCase();
  const ok = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v);
  if (ok) {
    const [L, c, h] = [Number(ok[1]) / 100, Number(ok[2]), (Number(ok[3]) * Math.PI) / 180];
    const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
    const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!hex) throw new Error(`colour ${value} is neither oklch(L% C H) nor a hex colour`);
  const full = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
  return [0, 2, 4].map((i) => linear(parseInt(full.slice(i, i + 2), 16) / 255)) as Rgb;
}

const luminance = (value: string) => {
  const [r, g, b] = toLinear(value).map((c) => Math.min(1, Math.max(0, c))) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const vars = (block: string) => Object.fromEntries([...block.matchAll(/(--[a-z-]+): ([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

const html = generate(repoRoot).writeup;
const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
const light = vars(/^:root \{([\s\S]*?)\n\}/m.exec(style)![1]!);
const dark = { ...light, ...vars(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n {2}\}/.exec(style)![1]!) };
const resolve = (value: string, scheme: Record<string, string>): string => {
  const ref = /^var\((--[a-z-]+)\)$/.exec(value.trim());
  return ref ? resolve(scheme[ref[1]!]!, scheme) : value.trim();
};

describe('writeup accessibility', () => {
  it('the committed writeup is the generator output this test checks', () => {
    expect(readFileSync(join(repoRoot, WRITEUP), 'utf8')).toBe(html);
  });

  // Every rule that sets a link's text colour (a, nav a, a:hover ...), outside @media blocks.
  const linkRules = [...style.matchAll(/(^|\n)([^{}\n]*\ba\b[^{}\n]*)\{([^}]*)\}/g)]
    .filter((m) => !m[2]!.includes('@media'))
    .map((m) => ({ selector: m[2]!.trim(), color: /(?:^|;)\s*color:\s*([^;]+);/.exec(m[3]!)?.[1] }))
    .filter((r): r is { selector: string; color: string } => r.color !== undefined);

  it('finds the link colour rules', () => {
    expect(linkRules.map((r) => r.selector)).toContain('a');
  });

  for (const [name, scheme] of [['light', light], ['dark', dark]] as const) {
    it(`every link colour meets 4.5:1 on the page and on a table card in ${name}`, () => {
      const failing: string[] = [];
      for (const r of linkRules) {
        const fg = resolve(r.color, scheme);
        for (const bg of ['--color-canvas', '--color-surface']) {
          const ratio = contrast(fg, resolve(scheme[bg]!, scheme));
          if (ratio < 4.5) failing.push(`${r.selector} ${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(failing).toEqual([]);
    });
  }

  it('the contrast maths reproduces the 3.24:1 axe measured for #5c85fb on the light page', () => {
    expect(contrast('#5c85fb', resolve(light['--color-canvas']!, light))).toBeCloseTo(3.24, 1);
  });

  // At 375px the two command blocks scroll sideways too (pre: overflow-x auto).
  it('every code block, which scrolls on a phone, takes keyboard focus', () => {
    const pres = [...html.matchAll(/<pre\b([^>]*)>/g)];
    expect(pres.length).toBeGreaterThan(0);
    expect(pres.filter((m) => !/\btabindex="0"/.test(m[1]!)).map((m) => m[0])).toEqual([]);
  });

  it('every table scroll box takes keyboard focus and is a region named by its caption', () => {
    const wraps = [...html.matchAll(/<div class="table-wrap"([^>]*)>\s*<table[^>]*>(?:<caption>([\s\S]*?)<\/caption>)?/g)];
    expect(wraps.length).toBeGreaterThan(0);
    expect(html.match(/class="table-wrap"/g)!.length).toBe(wraps.length);
    const bad = wraps.filter((w) => {
      const attrs = w[1]!;
      const label = /aria-label="([^"]*)"/.exec(attrs)?.[1];
      return !/\btabindex="0"/.test(attrs) || !/\brole="region"/.test(attrs) || label === undefined || label.trim() === '';
    });
    expect(bad.map((w) => w[0].slice(0, 120))).toEqual([]);
    for (const w of wraps.filter((x) => x[2] !== undefined)) {
      expect(/aria-label="([^"]*)"/.exec(w[1]!)![1]).toBe(w[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
  });
});
