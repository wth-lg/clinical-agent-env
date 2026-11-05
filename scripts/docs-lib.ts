// The small markdown and HTML reader that docs-gen.ts, ste-check.ts and docs-check.ts share
// (plan phase P24). Markdown: headings, paragraphs, bullet and numbered lists, fenced code,
// pipe tables and HTML comments, with inline code, bold and links. That is what the writeup
// sources use; anything else is passed through as text. Every rendered block carries
// data-src="<file>:<line>", so a finding on the HTML names the source line.
// HTML: the prose units of a page (headings, paragraphs, list items) with everything that is
// not prose left out: <pre>, <style>, tables, and the blocks docs-gen writes between
// <!-- docs-gen:begin x --> and <!-- docs-gen:end x -->.

export type Block =
  | { kind: 'heading'; level: number; text: string; line: number }
  | { kind: 'paragraph'; text: string; line: number }
  | { kind: 'list'; ordered: boolean; items: Array<{ text: string; line: number }>; line: number }
  | { kind: 'code'; lang: string; text: string; line: number }
  | { kind: 'table'; header: string[]; rows: string[][]; line: number }
  | { kind: 'html'; text: string; line: number };

// A unit of prose: a heading, a paragraph, a bullet (prose) or a step (an item of a numbered list).
export interface Unit {
  file: string;
  line: number;
  kind: 'heading' | 'prose' | 'step';
  text: string;
}

// The h2 sections docs/writeup.html must carry, in reading order: docs-gen reports the ones its
// sources lack, docs-check fails on them and donewhen names them (pre-audit-2 S19, one list).
export const WRITEUP_SECTIONS = ['Instructions', 'Findings', 'What is new in this design', 'Surprises', 'Changes', 'Next steps', 'How failures are attributed', 'Pass rates', 'How the environment differs from a real EHR', 'Audit against research and public environments', 'References'] as const;

export const GENERATED_BEGIN = /<!-- docs-gen:begin ([a-z-]+) -->/g;
export const GENERATED_END = /<!-- docs-gen:end ([a-z-]+) -->/g;
// What a code span or element becomes in a prose unit: one word that no rule reads.
export const CODE_TOKEN = 'CODE';

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRule = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let para: { lines: string[]; line: number } | null = null;
  const flush = () => {
    if (para !== null) blocks.push({ kind: 'paragraph', text: para.lines.join(' '), line: para.line });
    para = null;
  };
  while (i < lines.length) {
    const raw = lines[i]!;
    const line = i + 1;
    if (raw.trim() === '') {
      flush();
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!, line });
      i++;
      continue;
    }
    const fence = /^```\s*([a-z]*)\s*$/.exec(raw);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ kind: 'code', lang: fence[1] ?? '', text: body.join('\n'), line });
      continue;
    }
    if (raw.startsWith('<!--')) {
      flush();
      const body: string[] = [];
      while (i < lines.length) {
        body.push(lines[i]!);
        if (lines[i]!.includes('-->')) break;
        i++;
      }
      i++;
      blocks.push({ kind: 'html', text: body.join('\n'), line });
      continue;
    }
    if (raw.trim().startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1]!)) {
      flush();
      const header = cells(raw);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      blocks.push({ kind: 'table', header, rows, line });
      continue;
    }
    const item = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(raw);
    if (item && (para === null || item[1] === '')) {
      flush();
      const ordered = /\d/.test(item[2]!);
      const items: Array<{ text: string; line: number }> = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]!);
        if (m && (ordered ? /\d/.test(m[2]!) : !/\d/.test(m[2]!))) {
          items.push({ text: m[3]!, line: i + 1 });
          i++;
        } else if (lines[i]!.trim() !== '' && /^\s{2,}/.test(lines[i]!) && items.length > 0) {
          items[items.length - 1]!.text += ` ${lines[i]!.trim()}`;
          i++;
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items, line });
      continue;
    }
    if (para === null) para = { lines: [raw.trim()], line };
    else para.lines.push(raw.trim());
    i++;
  }
  flush();
  return blocks;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline markdown to HTML: code spans first (nothing inside them is markdown), then links and bold.
export function renderInline(text: string): string {
  return text.split(/(`[^`]*`)/).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    return escapeHtml(part)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => `<a href="${href}">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }).join('');
}

// Inline markdown to prose: code spans become CODE_TOKEN, links keep their text, bold its text.
export function proseInline(text: string): string {
  return text.split(/(`[^`]*`)/).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) return CODE_TOKEN;
    return part.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
  }).join('');
}

export const slug = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Blocks to HTML. A markdown heading of level n becomes h(n + shift); the writeup's sections
// are h2 under the page's one h1. A heading's id is its slug.
export function renderBlocks(blocks: readonly Block[], file: string, shift = 1): string {
  const src = (line: number) => ` data-src="${escapeHtml(file)}:${line}"`;
  return blocks.map((b) => {
    switch (b.kind) {
      case 'heading': {
        const n = Math.min(6, b.level + shift);
        return `<h${n} id="${slug(b.text)}"${src(b.line)}>${renderInline(b.text)}</h${n}>`;
      }
      case 'paragraph':
        return `<p${src(b.line)}>${renderInline(b.text)}</p>`;
      case 'list':
        return `<${b.ordered ? 'ol' : 'ul'}${src(b.line)}>\n${b.items.map((it) => `<li${src(it.line)}>${renderInline(it.text)}</li>`).join('\n')}\n</${b.ordered ? 'ol' : 'ul'}>`;
      case 'code':
        return `<pre${src(b.line)}><code>${escapeHtml(b.text)}</code></pre>`;
      case 'table':
        return `<div class="table-wrap">\n<table${src(b.line)}>\n<thead><tr>${b.header.map((h) => `<th scope="col">${renderInline(h)}</th>`).join('')}</tr></thead>\n<tbody>\n${b.rows.map((r) => `<tr>${r.map((c, j) => (j === 0 ? `<th scope="row">${renderInline(c)}</th>` : `<td>${renderInline(c)}</td>`)).join('')}</tr>`).join('\n')}\n</tbody>\n</table>\n</div>`;
      case 'html':
        return b.text;
    }
  }).join('\n');
}

// The prose units of a markdown file.
export function markdownUnits(text: string, file: string): Unit[] {
  const units: Unit[] = [];
  for (const b of parseMarkdown(text)) {
    if (b.kind === 'heading') units.push({ file, line: b.line, kind: 'heading', text: proseInline(b.text) });
    else if (b.kind === 'paragraph') units.push({ file, line: b.line, kind: 'prose', text: proseInline(b.text) });
    else if (b.kind === 'list') for (const it of b.items) units.push({ file, line: it.line, kind: b.ordered ? 'step' : 'prose', text: proseInline(it.text) });
  }
  return units;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
export const decodeEntities = (s: string) => s.replace(/&(#?\w+);/g, (m, name: string) => ENTITIES[name] ?? m);

// The prose units of an HTML page: each p, li and heading outside pre, style, table and generated
// blocks; an li of an ol is a step. A unit's line is its data-src, else the line of its tag.
export function htmlUnits(html: string, file: string): Unit[] {
  const units: Unit[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let skip: string[] = []; // the open elements whose text is not prose
  let generated = 0;
  const listStack: string[] = [];
  let open: { tag: string; file: string; line: number; parts: string[]; code: number } | null = null;
  let last = 0;
  const lineOf = (index: number) => html.slice(0, index).split('\n').length;
  const text = (from: number, to: number) => {
    if (open === null || skip.length > 0 || generated > 0) return;
    const t = html.slice(from, to);
    if (open.code === 0 && t !== '') open.parts.push(decodeEntities(t));
  };
  for (const m of html.matchAll(re)) {
    text(last, m.index);
    last = m.index + m[0].length;
    const token = m[0];
    if (token.startsWith('<!--')) {
      if (/<!-- docs-gen:begin /.test(token)) generated++;
      else if (/<!-- docs-gen:end /.test(token) && generated > 0) generated--;
      continue;
    }
    const tag = m[1]!.toLowerCase();
    const closing = token.startsWith('</');
    const NOT_PROSE = ['pre', 'style', 'table', 'script', 'head'];
    if (NOT_PROSE.includes(tag)) {
      if (closing) skip = skip.filter((t) => t !== tag);
      else skip.push(tag);
      continue;
    }
    if (tag === 'ol' || tag === 'ul') {
      if (closing) listStack.pop();
      else listStack.push(tag);
      continue;
    }
    if (tag === 'code') {
      if (open !== null) {
        if (closing) open.code = Math.max(0, open.code - 1);
        else {
          open.code++;
          open.parts.push(` ${CODE_TOKEN} `);
        }
      }
      continue;
    }
    const unitTag = /^(p|li|h[1-6])$/.test(tag);
    if (!unitTag) continue;
    if (closing) {
      if (open !== null && open.tag === tag) {
        if (skip.length === 0 && generated === 0) {
          const kind = tag === 'li' ? (listStack.at(-1) === 'ol' ? 'step' : 'prose') : tag === 'p' ? 'prose' : 'heading';
          const t = open.parts.join('').replace(/\s+/g, ' ').trim();
          if (t !== '') units.push({ file: open.file, line: open.line, kind, text: t });
        }
        open = null;
      }
      continue;
    }
    const src = /data-src="([^"]+):(\d+)"/.exec(m[2] ?? '');
    open = { tag, file: src ? decodeEntities(src[1]!) : file, line: src ? Number(src[2]) : lineOf(m.index), parts: [], code: 0 };
  }
  return units;
}

// Sentences of a unit's text. A sentence ends at . ! or ? (with closing quotes or brackets)
// followed by the end of the text or by a space and a capital letter, digit or opening quote;
// "Node.js", "22.18" and "127.0.0.1" do not end one.
export function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]+["'”’)\]]*(?=$|\s+["“'([]?[A-Z0-9])/g)) {
    const end = m.index + m[0].length;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest !== '') out.push(rest);
  return out.filter((s) => s !== '');
}

export const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
