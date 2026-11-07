import { useMemo, useRef, useState } from 'react';
import { Avatar } from './ui.jsx';

/* A textarea that suggests workspace members after "@" and inserts "@Full Name". */
export default function MentionTextarea({ value, onChange, members, onSubmit, placeholder, disabled, rows = 3 }) {
  const ref = useRef(null);
  const [query, setQuery] = useState(null); // { start, text }
  const [active, setActive] = useState(0);

  const suggestions = useMemo(() => {
    if (!query) return [];
    const needle = query.text.toLowerCase();
    return members.filter((m) => !needle || m.name.toLowerCase().includes(needle)).slice(0, 6);
  }, [query, members]);

  function detect(text, caret) {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/);
    if (m) {
      setQuery({ start: caret - m[1].length - 1, text: m[1] });
      setActive(0);
    } else {
      setQuery(null);
    }
  }

  function insert(member) {
    const el = ref.current;
    const caret = el.selectionStart;
    const next = `${value.slice(0, query.start)}@${member.name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    const pos = query.start + member.name.length + 2;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }

  function onKeyDown(e) {
    if (query && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(suggestions[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.(); }
  }

  return (
    <div className="relative">
      {query && suggestions.length > 0 && (
        <ul aria-label="Mention a teammate" className="menu !absolute bottom-full left-0 mb-1 w-64" role="listbox">
          {suggestions.map((m, i) => (
            <li key={m.id} role="presentation">
              <button aria-selected={i === active} className="menu-item" data-active={i === active} onMouseDown={(e) => { e.preventDefault(); insert(m); }} role="option" type="button">
                <Avatar size={20} user={m} /><span className="truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        aria-label="Comment"
        className="input"
        disabled={disabled}
        maxLength={10000}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onClick={(e) => detect(value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={ref}
        rows={rows}
        value={value}
      />
    </div>
  );
}
