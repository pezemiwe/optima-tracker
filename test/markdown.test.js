'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let md;
test.before(async () => { md = await import('../src/lib/markdown.mjs'); });

const flat = (nodes) => nodes.map((n) => (n.children ? flat(n.children) : n.text || '')).join('');

test('inline formatting nests and leaves plain text alone', () => {
  const nodes = md.parseInline('a **bold _and italic_** and `code` ~~gone~~');
  const types = nodes.map((n) => n.t);
  assert.deepEqual(types, ['text', 'strong', 'text', 'code', 'text', 'del']);
  assert.equal(flat(nodes), 'a bold and italic and code gone');
  assert.equal(nodes[1].children[1].t, 'em');
  assert.deepEqual(md.parseInline('snake_case_name and 2*3*4'), [{ t: 'text', text: 'snake_case_name and 2*3*4' }], 'identifiers and maths are not emphasis');
});

test('links: http, https and mailto only; script schemes stay as text', () => {
  const ok = md.parseInline('see [docs](https://example.com/a?b=1) now')[1];
  assert.equal(ok.t, 'link');
  assert.equal(ok.href, 'https://example.com/a?b=1');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', '//evil.example']) {
    const nodes = md.parseInline(`[click](${bad})`);
    assert.ok(nodes.every((n) => n.t !== 'link'), `${bad} must not become a link`);
  }
  assert.equal(md.parseInline('mail [me](mailto:a@b.co)')[1].href, 'mailto:a@b.co');
  const auto = md.parseInline('go to https://example.com/path, then stop.');
  assert.equal(auto[1].href, 'https://example.com/path', 'trailing punctuation is not part of the link');
});

test('HTML in the source is only ever text', () => {
  const blocks = md.parseBlocks('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
  assert.equal(blocks[0].type, 'p');
  assert.equal(flat(blocks[0].inline), '<script>alert(1)</script> and <img src=x onerror=alert(1)>');
});

test('blocks: headings, lists, task lists, quotes, code and rules', () => {
  const src = ['# Title', '', 'First line', 'second line', '', '- [ ] todo', '- [x] done', '- plain', '', '1. one', '2. two', '', '> quoted', '> more', '', '```js', 'const a = 1;', '```', '', '---'].join('\n');
  const b = md.parseBlocks(src);
  assert.deepEqual(b.map((x) => x.type), ['h', 'p', 'ul', 'ol', 'quote', 'code', 'hr']);
  assert.equal(b[0].level, 1);
  assert.deepEqual(b[1].inline.map((n) => n.t), ['text', 'br', 'text']);
  assert.deepEqual(b[2].items.map((i) => i.checked), [false, true, null]);
  assert.equal(b[3].items.length, 2);
  assert.equal(b[4].blocks[0].type, 'p');
  assert.equal(b[5].text, 'const a = 1;');
  assert.equal(b[5].lang, 'js');
});

test('an unclosed code fence swallows the rest instead of breaking', () => {
  const b = md.parseBlocks('```\nline 1\nline 2');
  assert.equal(b.length, 1);
  assert.equal(b[0].text, 'line 1\nline 2');
});

test('ticking a task-list item rewrites only that line', () => {
  const src = '- [ ] a\n- [x] b\ntext';
  const first = md.parseBlocks(src)[0].items[0];
  assert.equal(md.toggleTaskLine(src, first.line), '- [x] a\n- [x] b\ntext');
  assert.equal(md.toggleTaskLine('- [x] a', 0), '- [ ] a');
  assert.equal(md.toggleTaskLine(src, 99), src);
});

test('stripping markdown makes short plain previews', () => {
  assert.equal(md.stripMarkdown('# Hi **there** [x](https://a.co)'), 'Hi there xhttps://a.co');
  assert.equal(md.stripMarkdown('a'.repeat(300), 10), 'aaaaaaaaa…');
});
