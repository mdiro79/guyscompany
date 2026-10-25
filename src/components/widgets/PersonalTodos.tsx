'use client';
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type MouseEvent } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Sparkles, Star, CalendarDays, Flag, MoreHorizontal, Trash2, Sun, Sunrise, X, Check, Flame, ListTodo, Target, Award } from 'lucide-react';
import { addTodoAction, updateTodoAction, deleteTodoAction, clearDoneTodosAction } from '@/app/actions/todos';
import type { ActionResult } from '@/app/actions/result';
import { formatDate, formatNumber, zonedDate } from '@/lib/format';
import { parseQuickAdd, dueKind, sortTodos, streak, addDays, type Priority } from '@/lib/todos';
import { achievements, levelOf, quests, xpFor, CATEGORY_EMOJI, TODO_CATEGORIES, type TodoCategory, type TodoStats } from '@/lib/todo-game';
import type { Todo } from '@/lib/data/types';
import { BadgesPanel, LevelBadge, QuestsPanel, WeekStrip, XpBar } from './TodoGame';

type Filter = 'all' | 'today' | 'starred' | TodoCategory;
type Tab = 'list' | 'quests' | 'badges';
type Change = { kind: 'add'; todo: Todo } | { kind: 'patch'; id: string; patch: Partial<Todo> } | { kind: 'remove'; id: string } | { kind: 'clear' };

const CHEERS = 6;
const PRIORITY_COLOR = ['text-muted', 'text-[#d99a1e]', 'text-danger'];
const PROGRESS_EMOJI = (p: number) => (p >= 1 ? '🎉' : p >= 0.5 ? '🚀' : p > 0 ? '💪' : '🌱');

// Confetti that flies out from a point (the ticked box, or the middle of the card when everything is done).
function Burst({ x, y, big }: { x: number; y: number; big: boolean }) {
  const colors = ['#f07a2a', '#2f5d45', '#3fb3ad', '#f6c544', '#d9443c', '#8b6fd6'];
  const n = big ? 28 : 12;
  return (
    <span className="pointer-events-none absolute z-20" style={{ left: x, top: y }} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3, d = (big ? 70 : 34) + (i % 4) * (big ? 22 : 9);
        return (
          <span key={i} className="gc-burst absolute block rounded-[2px]"
            style={{ width: i % 2 ? 6 : 4, height: i % 2 ? 4 : 7, background: colors[i % colors.length],
              ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d - (big ? 20 : 8)}px`, ['--rot' as string]: `${(i % 2 ? 1 : -1) * 220}deg` }} />
        );
      })}
    </span>
  );
}

// The member's own to-do list on the home dashboard, played as a game: XP and levels, a week strip and
// streak, daily quests and achievements. Smart quick add (dates, priority, star and #category typed in
// the text), due chips, stars, priorities, filters, confetti and cheers. Changes show at once and roll
// back if saving fails.
export function PersonalTodos({ todos, today, stats }: { todos: Todo[]; today: string; stats: TodoStats }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  const [, start] = useTransition();
  const [list, apply] = useOptimistic(todos, (cur: Todo[], c: Change) => {
    if (c.kind === 'add') return [...cur, c.todo];
    if (c.kind === 'patch') return cur.map((x) => (x.id === c.id ? { ...x, ...c.patch } : x));
    if (c.kind === 'remove') return cur.filter((x) => x.id !== c.id);
    const now = new Date().toISOString();
    return cur.map((x) => (x.done && !x.clearedAt ? { ...x, clearedAt: now } : x));
  });
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cheer, setCheer] = useState<{ text: string; key: number } | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; big: boolean }[]>([]);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [tab, setTab] = useState<Tab>('list');
  // XP shown before the server's score arrives (cleared when it does).
  const [gain, setGain] = useState(0);
  const card = useRef<HTMLElement>(null);
  const shownXp = stats.xp + gain;
  useEffect(() => setGain(0), [stats.xp]);

  // Level-ups and new badges are celebrated when the server's score shows them.
  const prev = useRef(stats);
  useEffect(() => {
    const before = prev.current;
    prev.current = stats;
    if (before === stats) return;
    const up = levelOf(stats.xp).level > levelOf(before.xp).level;
    const oldTiers = new Map(achievements(before).map((a) => [a.id, a.tier]));
    const badge = achievements(stats).find((a) => a.tier > (oldTiers.get(a.id) ?? 0));
    if (!up && !badge) return;
    const box = card.current?.getBoundingClientRect();
    if (box) fire(box.width / 2, 60, true);
    setCheer({ text: up ? t('levelUp', { n: formatNumber(locale, levelOf(stats.xp).level) })
      : t('newBadge', { name: t(`badge.${badge!.id}`), tier: t(`tier${badge!.tier}` as 'tier1') }), key: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  const visible = useMemo(() => list.filter((x) => !x.clearedAt), [list]);
  const open = useMemo(() => sortTodos(visible.filter((x) => !x.done)), [visible]);
  const done = useMemo(() => sortTodos(visible.filter((x) => x.done)), [visible]);
  const days = useMemo(() => list.filter((x) => x.done && x.doneAt).map((x) => zonedDate(x.doneAt!)), [list]);
  const doneDays = useMemo(() => new Set(days), [days]);
  const streakDays = streak(days, today);
  const match = (x: Todo, f: Filter) => (f === 'today' ? x.due !== null && x.due <= today : f === 'starred' ? x.starred : f === 'all' ? true : x.category === f);
  const shown = open.filter((x) => match(x, filter));
  const counts = { all: open.length, today: open.filter((x) => match(x, 'today')).length, starred: open.filter((x) => x.starred).length };
  const usedCategories = TODO_CATEGORIES.filter((c) => open.some((x) => x.category === c));
  const questList = quests(list, today);
  const questsDone = questList.filter((q) => q.done).length;
  const badgeTiers = achievements(stats).reduce((n, a) => n + a.tier, 0);
  const progress = visible.length ? done.length / visible.length : 0;
  const preview = text.trim() ? parseQuickAdd(text, today) : null;
  const recognised = preview && (preview.due || preview.priority || preview.starred || preview.category);

  const save = (change: Change, call: () => Promise<ActionResult>, onFail?: () => void) => {
    setError(null);
    start(async () => {
      apply(change);
      const r = await call().catch(() => null);
      if (!r?.ok) { onFail?.(); setError(t(r?.error === 'tooMany' ? 'tooMany' : 'saveFailed')); return; }
      // All of today's quests done: the bonus.
      const bonus = Number(r.data?.bonus ?? 0);
      if (bonus > 0) {
        const box = card.current?.getBoundingClientRect();
        if (box) fire(box.width / 2, box.height / 3, true);
        setCheer({ text: t('questsDone', { n: formatNumber(locale, bonus) }), key: Date.now() });
      }
    });
  };

  const fire = (x: number, y: number, big: boolean) => {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, x, y, big }]);
    setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 900);
  };

  const celebrate = (e: MouseEvent<HTMLElement>, all: boolean, xp: number) => {
    const box = card.current?.getBoundingClientRect();
    const at = e.currentTarget.getBoundingClientRect();
    if (!box) return;
    const id = Date.now();
    const x = all ? box.width / 2 : at.left - box.left + at.width / 2, y = all ? box.height / 2 : at.top - box.top + at.height / 2;
    fire(x, y, all);
    // "+15 XP" rises from the ticked box.
    const fx = at.left - box.left + at.width / 2, fy = at.top - box.top;
    setFloats((f) => [...f, { id, x: fx, y: fy, text: t('xpGain', { n: formatNumber(locale, xp) }) }]);
    setTimeout(() => setFloats((f) => f.filter((p) => p.id !== id)), 1100);
    setCheer({ text: all ? t('allDone') : t(`cheer${Math.floor(Math.random() * CHEERS)}` as 'cheer0'), key: id });
    navigator.vibrate?.(all ? [15, 40, 25] : 12);
  };

  const add = () => {
    if (!preview) return;
    const todo: Todo = { id: `pending:${crypto.randomUUID()}`, userId: '', title: preview.title, done: false, doneAt: null, due: preview.due,
      priority: preview.priority, starred: preview.starred, clearedAt: null, category: preview.category ?? 'personal', xp: 0, createdAt: new Date().toISOString() };
    setText('');
    save({ kind: 'add', todo }, () => addTodoAction(preview));
  };
  const patch = (x: Todo, p: { title?: string; due?: string | null; priority?: Priority; starred?: boolean; done?: boolean; category?: TodoCategory }, onFail?: () => void) => {
    if (x.id.startsWith('pending:')) return;
    const local: Partial<Todo> = { ...p, ...(p.done !== undefined ? { doneAt: p.done ? new Date().toISOString() : null } : {}) };
    save({ kind: 'patch', id: x.id, patch: local }, () => updateTodoAction(x.id, p), onFail);
  };
  const toggle = (x: Todo, e: MouseEvent<HTMLElement>) => {
    if (!x.done) {
      const xp = xpFor(x, today);
      celebrate(e, open.length === 1, xp);
      setGain((g) => g + xp);
      patch(x, { done: true }, () => setGain((g) => g - xp));
    } else {
      setGain((g) => g - x.xp);
      patch(x, { done: false }, () => setGain((g) => g + x.xp));
    }
  };
  const finishEdit = () => {
    if (!editing) return;
    const x = list.find((i) => i.id === editing.id);
    if (x && editing.title.trim() && editing.title.trim() !== x.title) patch(x, { title: editing.title });
    setEditing(null);
  };

  const dueChip = (due: string) => {
    const kind = dueKind(due, today);
    const label = kind === 'today' ? t('today') : kind === 'tomorrow' ? t('tomorrow') : kind === 'week'
      ? formatDate(locale, `${due}T12:00:00Z`, { weekday: 'long' }) : formatDate(locale, `${due}T12:00:00Z`, { day: 'numeric', month: 'short' });
    return (
      <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap', kind === 'overdue' ? 'font-medium text-danger' : kind === 'today' ? 'font-medium text-accent' : 'text-muted')}>
        <CalendarDays className="size-3.5" />{kind === 'overdue' ? t('overdueOn', { date: label }) : label}
      </span>
    );
  };

  const item = (x: Todo) => {
    const pending = x.id.startsWith('pending:');
    return (
      <li key={x.id} className={clsx('rounded-xl px-1.5 py-1.5 transition-colors', menu === x.id ? 'bg-surface-2' : 'hover:bg-surface-2/60', pending && 'opacity-60')}>
        <div className="flex items-start gap-2.5">
          <button type="button" onClick={(e) => toggle(x, e)} aria-pressed={x.done} aria-label={x.title} disabled={pending}
            className={clsx('mt-0.5 flex size-6 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 transition-colors',
              x.done ? 'gc-pop border-brand bg-brand text-brand-ink' : 'border-line hover:border-brand')}>
            {x.done && <Check className="size-3.5" strokeWidth={3} />}
          </button>
          <div className="min-w-0 flex-1">
            {editing?.id === x.id ? (
              <input autoFocus value={editing.title} onChange={(e) => setEditing({ id: x.id, title: e.target.value })} onBlur={finishEdit} dir="auto"
                onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditing(null); }} className="input min-h-8 py-1 text-sm" />
            ) : (
              <button type="button" onClick={() => !x.done && !pending && setEditing({ id: x.id, title: x.title })} title={x.done ? undefined : t('edit')}
                className={clsx('block w-full text-start text-sm leading-6 break-words', x.done && 'text-muted line-through')} dir="auto">{x.title}</button>
            )}
            {!x.done && (x.due || x.starred || x.priority > 0 || x.category !== 'personal') && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                {x.category !== 'personal' && <span className="inline-flex items-center gap-1 text-muted">{CATEGORY_EMOJI[x.category]}{t(`cat.${x.category}`)}</span>}
                {x.due && dueChip(x.due)}
                {x.starred && <span className="inline-flex items-center gap-1 text-[#d99a1e]"><Star className="size-3.5 fill-current" />{t('starred')}</span>}
                {x.priority > 0 && <span className={clsx('inline-flex items-center gap-1', PRIORITY_COLOR[x.priority])}><Flag className="size-3.5 fill-current" />{t(`priority${x.priority}` as 'priority1')}</span>}
              </div>
            )}
          </div>
          {!x.done && (
            <button type="button" onClick={() => patch(x, { starred: !x.starred })} aria-label={t('star')} aria-pressed={x.starred} disabled={pending}
              className={clsx('flex size-8 shrink-0 items-center justify-center rounded-lg', x.starred ? 'text-[#e0a526]' : 'text-muted/60 hover:text-[#e0a526]')}>
              <Star className={clsx('size-4', x.starred && 'fill-current')} />
            </button>
          )}
          <button type="button" onClick={() => setMenu(menu === x.id ? null : x.id)} aria-label={t('more')} aria-expanded={menu === x.id} disabled={pending}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2"><MoreHorizontal className="size-4" /></button>
        </div>
        {menu === x.id && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 ps-8 text-xs">
            {!x.done && (
              <>
                <button type="button" className="chip gap-1 border border-line bg-surface" onClick={() => { setMenu(null); patch(x, { due: today }); }}><Sun className="size-3.5" />{t('today')}</button>
                <button type="button" className="chip gap-1 border border-line bg-surface" onClick={() => { setMenu(null); patch(x, { due: addDays(today, 1) }); }}><Sunrise className="size-3.5" />{t('tomorrow')}</button>
                <label className="chip relative gap-1 border border-line bg-surface">
                  <CalendarDays className="size-3.5" />{t('pickDate')}
                  <input type="date" className="absolute inset-0 opacity-0" value={x.due ?? ''} onChange={(e) => { setMenu(null); patch(x, { due: e.target.value || null }); }} aria-label={t('pickDate')} />
                </label>
                {x.due && <button type="button" className="chip gap-1 border border-line bg-surface" onClick={() => { setMenu(null); patch(x, { due: null }); }}><X className="size-3.5" />{t('noDate')}</button>}
                <button type="button" className={clsx('chip gap-1 border border-line bg-surface', PRIORITY_COLOR[x.priority])}
                  onClick={() => patch(x, { priority: ((x.priority + 1) % 3) as Priority })}>
                  <Flag className="size-3.5" />{t('priority')}: {t(`priority${x.priority}` as 'priority0')}
                </button>
                <span className="flex basis-full flex-wrap gap-1.5" role="group" aria-label={t('category')}>
                  {TODO_CATEGORIES.map((c) => (
                    <button key={c} type="button" aria-pressed={x.category === c} onClick={() => patch(x, { category: c })}
                      className={clsx('chip gap-1 border', x.category === c ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface')}>
                      {CATEGORY_EMOJI[c]}{t(`cat.${c}`)}
                    </button>
                  ))}
                </span>
              </>
            )}
            <button type="button" className="chip ms-auto gap-1 border border-line bg-surface text-danger"
              onClick={() => { setMenu(null); save({ kind: 'remove', id: x.id }, () => deleteTodoAction(x.id)); }}><Trash2 className="size-3.5" />{t('delete')}</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section ref={card} className="card relative overflow-hidden p-4 md:col-span-2">
      {bursts.map((b) => <Burst key={b.id} x={b.x} y={b.y} big={b.big} />)}
      {floats.map((f) => <span key={f.id} className="gc-float pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-[#e2651f]" style={{ left: f.x, top: f.y }}>{f.text}</span>)}
      <div className="flex items-center gap-3">
        <LevelBadge xp={shownXp} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <h2 className="font-semibold">{t('title')}</h2>
            {streakDays > 0 && (
              <span className="chip gap-1 bg-accent-soft text-accent" title={t('streak', { n: streakDays })}>
                <Flame className="gc-flicker size-3.5 fill-current" />{formatNumber(locale, streakDays)}
              </span>
            )}
            <span className="ms-auto hidden text-xs text-muted sm:inline">
              {visible.length > 0 && <>{t('progress', { done: formatNumber(locale, done.length), total: formatNumber(locale, visible.length) })} {PROGRESS_EMOJI(progress)}</>}
            </span>
          </div>
          <XpBar xp={shownXp} gain={gain > 0 ? gain : 0} />
        </div>
      </div>
      <div className="mt-3"><WeekStrip doneDays={doneDays} today={today} /></div>
      <div className="relative h-6">
        {cheer && <p key={cheer.key} className="gc-rise absolute inset-x-0 top-1 text-center text-xs font-semibold text-brand">{cheer.text}</p>}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
        {([['list', ListTodo, t('tabList'), formatNumber(locale, open.length)], ['quests', Target, t('tabQuests'), `${formatNumber(locale, questsDone)}/${formatNumber(locale, questList.length)}`],
          ['badges', Award, t('tabBadges'), formatNumber(locale, badgeTiers)]] as const).map(([k, Icon, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={clsx('flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all', tab === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            <Icon className="size-4 shrink-0" /><span className="truncate">{label}</span><span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'quests' && <QuestsPanel todos={list} today={today} stats={stats} />}
      {tab === 'badges' && <BadgesPanel stats={stats} />}
      {tab === 'list' && <>
      <div className="mb-2 flex flex-wrap gap-1">
        {(['all', 'today', 'starred'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={clsx('chip min-h-8 gap-1', filter === f ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted hover:text-ink')}>
            {t(f)} <span className="opacity-70">{formatNumber(locale, counts[f])}</span>
          </button>
        ))}
        {usedCategories.length > 1 && usedCategories.map((c) => (
          <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(filter === c ? 'all' : c)} title={t(`cat.${c}`)}
            className={clsx('chip min-h-8 gap-1', filter === c ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted hover:text-ink')}>
            {CATEGORY_EMOJI[c]}<span className="max-sm:hidden">{t(`cat.${c}`)}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-0.5">
        {shown.map(item)}
        {shown.length === 0 && (
          <li className="py-4 text-center text-sm text-muted">{filter === 'today' ? t('nothingToday') : filter === 'starred' ? t('nothingStarred') : visible.length || filter !== 'all' ? t('allDone') : t('empty')}</li>
        )}
      </ul>

      {done.length > 0 && filter === 'all' && (
        <>
          <div className="mt-2 flex items-center gap-2 px-1.5 text-xs text-muted">
            <span>{t('done', { n: formatNumber(locale, done.length) })}</span>
            <button type="button" className="ms-auto rounded-lg px-2 py-1 hover:bg-surface-2 hover:text-ink" onClick={() => save({ kind: 'clear' }, () => clearDoneTodosAction())}>{t('clearDone')}</button>
          </div>
          <ul className="space-y-0.5">{done.slice(0, 8).map(item)}</ul>
        </>
      )}

      <form className="mt-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="relative flex items-center">
          <Sparkles className="pointer-events-none absolute start-3 size-4 text-accent" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className="input min-h-11 rounded-full ps-9 pe-12 text-sm" dir="auto"
            maxLength={240} aria-describedby="todo-hint" />
          <button className="absolute end-1 flex size-9 items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-40" disabled={!text.trim()} aria-label={t('add')}>
            <Plus className="size-5" />
          </button>
        </div>
        {recognised ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-[11px]">
            <Sparkles className="size-3.5 text-accent" />
            {preview.category && <span className="inline-flex items-center gap-1 text-muted">{CATEGORY_EMOJI[preview.category]}{t(`cat.${preview.category}`)}</span>}
            {preview.due && dueChip(preview.due)}
            {preview.starred && <span className="inline-flex items-center gap-1 text-[#d99a1e]"><Star className="size-3.5 fill-current" />{t('starred')}</span>}
            {preview.priority > 0 && <span className={clsx('inline-flex items-center gap-1', PRIORITY_COLOR[preview.priority])}><Flag className="size-3.5 fill-current" />{t(`priority${preview.priority}` as 'priority1')}</span>}
          </div>
        ) : (
          <p id="todo-hint" className="mt-1.5 px-3 text-[11px] leading-5 text-muted">{t('hint')}</p>
        )}
        {error && <p className="mt-1 px-3 text-xs text-danger" role="alert">{error}</p>}
      </form>
      </>}
    </section>
  );
}
