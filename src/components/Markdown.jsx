import { Fragment, useMemo } from 'react';
import { splitMentions } from '../lib/activity.mjs';
import { parseBlocks } from '../lib/markdown.mjs';

/* Renders the safe Markdown AST as React elements. Nothing here uses innerHTML. */

function Inline({ nodes, members }) {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return (
          <Fragment key={i}>
            {members.length
              ? splitMentions(n.text, members).map((p, j) => (p.mention
                ? <span className="rounded bg-[#86bc25]/20 px-0.5 font-medium text-[#3d6208] dark:text-[#a6d95a]" key={j}>{p.text}</span>
                : <Fragment key={j}>{p.text}</Fragment>))
              : n.text}
          </Fragment>
        );
      case 'code': return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-[#242a33]" key={i}>{n.text}</code>;
      case 'strong': return <strong className="font-semibold" key={i}><Inline members={members} nodes={n.children} /></strong>;
      case 'em': return <em key={i}><Inline members={members} nodes={n.children} /></em>;
      case 'del': return <del className="opacity-70" key={i}><Inline members={members} nodes={n.children} /></del>;
      case 'link': return <a className="text-[#3d6208] underline underline-offset-2 hover:text-[#2c4a06] dark:text-[#a6d95a]" href={n.href} key={i} rel="noopener noreferrer nofollow" target="_blank"><Inline members={members} nodes={n.children} /></a>;
      case 'br': return <br key={i} />;
      default: return null;
    }
  });
}

function Block({ b, members, onToggleTask }) {
  switch (b.type) {
    case 'h': {
      const cls = { 1: 'text-xl font-semibold mt-4 mb-2', 2: 'text-lg font-semibold mt-4 mb-2', 3: 'text-base font-semibold mt-3 mb-1.5' }[b.level];
      const Tag = `h${b.level + 2}`; // the panel already owns h1/h2
      return <Tag className={cls}><Inline members={members} nodes={b.inline} /></Tag>;
    }
    case 'p': return <p className="my-2 leading-relaxed"><Inline members={members} nodes={b.inline} /></p>;
    case 'hr': return <hr className="my-4 border-line" />;
    case 'code': return <pre className="my-2 overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-[13px] leading-relaxed dark:bg-[#1b2028]"><code>{b.text}</code></pre>;
    case 'quote': return <blockquote className="my-2 border-l-4 border-slate-300 pl-3 text-slate-600 dark:border-[#414957] dark:text-slate-300">{b.blocks.map((x, i) => <Block b={x} key={i} members={members} />)}</blockquote>;
    case 'ul':
    case 'ol': {
      const Tag = b.type;
      const hasTasks = b.items.some((i) => i.checked !== null);
      return (
        <Tag className={`my-2 grid gap-1 ${hasTasks ? 'list-none pl-0' : b.type === 'ul' ? 'list-disc pl-5' : 'list-decimal pl-5'}`}>
          {b.items.map((item, i) => (
            <li className={item.checked !== null ? 'flex items-start gap-2' : ''} key={i}>
              {item.checked !== null && (
                <input aria-label={item.checked ? 'Mark not done' : 'Mark done'} checked={item.checked} className="mt-1 size-4 cursor-pointer accent-[#86bc25] disabled:cursor-default" disabled={!onToggleTask} onChange={() => onToggleTask(item.line)} type="checkbox" />
              )}
              <span className={item.checked ? 'opacity-60 line-through' : ''}><Inline members={members} nodes={item.inline} /></span>
            </li>
          ))}
        </Tag>
      );
    }
    default: return null;
  }
}

export default function Markdown({ source, members = [], onToggleTask, className = '' }) {
  const blocks = useMemo(() => parseBlocks(source || ''), [source]);
  return (
    <div className={`break-words text-sm text-slate-800 dark:text-slate-200 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      {blocks.map((b, i) => <Block b={b} key={i} members={members} onToggleTask={onToggleTask} />)}
    </div>
  );
}
