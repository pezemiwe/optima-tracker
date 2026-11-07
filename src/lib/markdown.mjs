/*
 * A small, safe Markdown parser. It produces a plain AST that React renders as elements,
 * so user text is never interpreted as HTML. Links are limited to http, https and mailto.
 */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/* ---------- inline ---------- */
const PATTERNS = [
  { t: 'code', re: /`([^`\n]+)`/ },
  { t: 'link', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  { t: 'strong', re: /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/ },
  { t: 'del', re: /~~([^~\n]+?)~~/ },
  { t: 'em', re: /(?<![\w*])\*([^*\s][^*\n]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_\n]*?)_(?![\w_])/ },
  { t: 'auto', re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/ },
];

export function parseInline(text) {
  const out = [];
  let rest = text;
  while (rest) {
    let best = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { p, m };
    }
    if (!best) { out.push({ t: 'text', text: rest }); break; }
    const { p, m } = best;
    if (m.index > 0) out.push({ t: 'text', text: rest.slice(0, m.index) });
    if (p.t === 'code') out.push({ t: 'code', text: m[1] });
    else if (p.t === 'link') {
      if (SAFE_LINK.test(m[2])) out.push({ t: 'link', href: m[2], children: parseInline(m[1]) });
      else out.push({ t: 'text', text: m[0] }); // unsafe scheme: show it as plain text, never as a link
    } else if (p.t === 'auto') out.push({ t: 'link', href: m[0], children: [{ t: 'text', text: m[0] }] });
    else out.push({ t: p.t, children: parseInline(m[1] ?? m[2]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/* ---------- blocks ---------- */
const isBlank = (l) => /^\s*$/.test(l);
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseBlocks(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of text)
      blocks.push({ type: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'h', level: h[1].length, inline: parseInline(h[2].trim()) }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(body.join('\n')) });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        let text = m[3];
        let checked = null;
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
        if (task && !ordered) { checked = task[1] !== ' '; text = task[2]; }
        items.push({ checked, inline: parseInline(text), line: i });
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // Paragraph: consecutive plain lines, joined with line breaks.
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(```|#{1,3}\s|>\s?|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++]);
    const inline = [];
    para.forEach((p, idx) => { if (idx) inline.push({ t: 'br' }); inline.push(...parseInline(p)); });
    blocks.push({ type: 'p', inline });
  }
  return blocks;
}

/* Flips the checkbox on a given source line, returning the new source. */
export function toggleTaskLine(source, lineIndex) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return source;
  lines[lineIndex] = /\[ \]/.test(l) ? l.replace('[ ]', '[x]') : l.replace(/\[[xX]\]/, '[ ]');
  return lines.join('\n');
}

/* Plain-text version for previews and notifications. */
export function stripMarkdown(source, max = 140) {
  const text = String(source).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~[\]()-]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
