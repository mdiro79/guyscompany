'use client';
import { useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Search, ImageIcon, MessageSquare, Trash2, Send, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { updateIssueAction, deleteIssueAction, commentIssueAction } from '@/app/actions/command';
import { formatDate, formatTime, formatNumber } from '@/lib/format';
import { isOpenIssue } from '@/lib/project-health';
import { ISSUE_STATUSES, type Issue, type IssueComment, type IssueKind, type Severity } from '@/lib/data/types';
import { SeverityBadge, IssueStatusBadge, KindBadge } from './badges';

type StatusFilter = 'open' | 'all' | Issue['status'];
const SEVERITY_EDGE = ['border-s-line', 'border-s-[#e0b53a]', 'border-s-accent', 'border-s-danger'];

const fileUrl = (id: string) => `/api/files/${id}`;

// Full-size screenshot viewer with previous/next.
function Lightbox({ ids, index, onClose, onMove }: { ids: string[]; index: number; onClose: () => void; onMove: (i: number) => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fileUrl(ids[index])} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <button type="button" className="absolute top-3 end-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white" onClick={onClose} aria-label="close"><X className="size-5" /></button>
      {ids.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3" dir="ltr" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white" onClick={() => onMove((index + ids.length - 1) % ids.length)} aria-label="previous"><ChevronLeft className="size-5" /></button>
          <span className="flex items-center text-sm text-white/80">{index + 1}/{ids.length}</span>
          <button type="button" className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white" onClick={() => onMove((index + 1) % ids.length)} aria-label="next"><ChevronRight className="size-5" /></button>
        </div>
      )}
    </div>
  );
}

function IssueDialog({ issue, comments, canDelete, onClose }: { issue: Issue; comments: IssueComment[]; canDelete: boolean; onClose: () => void }) {
  const t = useTranslations('command');
  const tf = useTranslations('command.form');
  const locale = useLocale();
  const { profiles } = useShell();
  const [, start] = useTransition();
  const [comment, setComment] = useState('');
  const [shot, setShot] = useState<number | null>(null);
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  const update = (patch: Parameters<typeof updateIssueAction>[1]) => start(async () => { await updateIssueAction(issue.id, patch); });
  return (
    <Dialog open onClose={onClose} title={issue.title} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={issue.kind} /><SeverityBadge severity={issue.severity} /><IssueStatusBadge status={issue.status} />
          <span className="text-xs text-muted">{t('reportedBy', { name: name(issue.reporterId) })}</span><span className="text-xs text-muted">{formatDate(locale, issue.createdAt)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-muted">{t('changeStatus')}
            <select className="input mt-1" value={issue.status} onChange={(e) => update({ status: e.target.value as Issue['status'] })}>
              {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{t(`istatus.${s}`)}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">{tf('severity')}
            <select className="input mt-1" value={issue.severity} onChange={(e) => update({ severity: Number(e.target.value) as Severity })}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{t(`sev.${n}` as 'sev.0')}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">{tf('assignee')}
            <select className="input mt-1" value={issue.assigneeId ?? ''} onChange={(e) => update({ assigneeId: e.target.value || null })}>
              <option value="">{tf('nobody')}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </label>
        </div>
        {issue.description && <p className="whitespace-pre-wrap leading-6" dir="auto">{issue.description}</p>}
        {issue.steps && (
          <div><div className="mb-1 text-xs font-semibold text-muted">{tf('steps')}</div>
            <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 leading-6" dir="auto">{issue.steps}</p></div>
        )}
        {issue.screenshotIds.length > 0 && (
          <div><div className="mb-1 text-xs font-semibold text-muted">{tf('screenshots')}</div>
            <div className="flex flex-wrap gap-2">
              {issue.screenshotIds.map((id, i) => (
                <button key={id} type="button" onClick={() => setShot(i)} className="size-24 overflow-hidden rounded-xl border border-line hover:ring-2 hover:ring-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(id)} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">{t('comments')} ({formatNumber(locale, comments.length)})</div>
          <ul className="space-y-2">
            {comments.map((c) => {
              const author = profiles.find((p) => p.id === c.authorId) ?? null;
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar profile={author} size="sm" />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-surface-2 px-3 py-2">
                    <div className="flex gap-2 text-xs"><span className="font-semibold">{author?.displayName ?? '—'}</span><span className="text-muted" dir="ltr">{formatTime(locale, c.createdAt)}</span></div>
                    <p className="mt-0.5 whitespace-pre-wrap" dir="auto">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = comment; if (!v.trim()) return; setComment(''); start(async () => { await commentIssueAction(issue.id, v); }); }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('commentPh')} className="input" dir="auto" />
            <button className="btn-primary shrink-0" disabled={!comment.trim()} aria-label={t('send')}><Send className="size-4 rtl:-scale-x-100" /></button>
          </form>
        </div>
        {canDelete && (
          <button type="button" className="flex items-center gap-1.5 text-xs text-danger"
            onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteIssueAction(issue.id); onClose(); }); }}><Trash2 className="size-3.5" />{t('delete')}</button>
        )}
      </div>
      {shot !== null && <Lightbox ids={issue.screenshotIds} index={shot} onClose={() => setShot(null)} onMove={setShot} />}
    </Dialog>
  );
}

export function IssuesPanel({ issues, comments, canManage, onReport, openId, setOpenId }: {
  issues: Issue[]; comments: IssueComment[]; canManage: boolean; onReport: () => void; openId: string | null; setOpenId: (id: string | null) => void;
}) {
  const t = useTranslations('command');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<IssueKind | 'all'>('all');
  const [q, setQ] = useState('');
  const shown = useMemo(() => issues
    .filter((i) => (status === 'all' ? true : status === 'open' ? isOpenIssue(i) : i.status === status))
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !q.trim() || `${i.title} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(isOpenIssue(b)) - Number(isOpenIssue(a)) || b.severity - a.severity || b.createdAt.localeCompare(a.createdAt)),
  [issues, status, kind, q]);
  const count = (f: StatusFilter) => issues.filter((i) => (f === 'all' ? true : f === 'open' ? isOpenIssue(i) : i.status === f)).length;
  const open = issues.find((i) => i.id === openId) ?? null;

  return (
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {(['open', 'all', ...ISSUE_STATUSES] as StatusFilter[]).map((f) => (
            <button key={f} type="button" onClick={() => setStatus(f)} aria-pressed={status === f}
              className={clsx('chip min-h-8 gap-1', status === f ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted hover:text-ink')}>
              {f === 'open' ? t('filterOpen') : f === 'all' ? t('filterAll') : t(`istatus.${f}`)} <span className="opacity-70">{formatNumber(locale, count(f))}</span>
            </button>
          ))}
        </div>
        <select className="input min-h-9 w-auto py-0 text-xs" value={kind} onChange={(e) => setKind(e.target.value as IssueKind | 'all')}>
          <option value="all">{t('filterAll')}</option><option value="bug">{t('kind.bug')}</option><option value="defect">{t('kind.defect')}</option>
        </select>
        <div className="relative ms-auto min-w-40 flex-1 sm:max-w-56">
          <Search className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="input min-h-9 ps-8 text-sm" dir="auto" />
        </div>
        <button type="button" className="btn-primary min-h-9" onClick={onReport}><Plus className="size-4" />{t('reportBug')}</button>
      </div>
      <ul className="space-y-2">
        {shown.length === 0 && <li className="py-10 text-center text-sm text-muted">{t('issuesEmpty')}</li>}
        {shown.map((i) => {
          const assignee = profiles.find((p) => p.id === i.assigneeId) ?? null;
          const n = comments.filter((c) => c.issueId === i.id).length;
          return (
            <li key={i.id}>
              <button type="button" onClick={() => setOpenId(i.id)}
                className={clsx('flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line border-s-4 bg-surface px-3 py-2.5 text-start hover:bg-surface-2', SEVERITY_EDGE[i.severity], !isOpenIssue(i) && 'opacity-70')}>
                <span className="min-w-0 flex-1 basis-48">
                  <span className={clsx('block truncate text-sm font-medium', i.status === 'closed' && 'line-through')} dir="auto">{i.title}</span>
                  <span className="text-xs text-muted">{formatDate(locale, i.createdAt)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <KindBadge kind={i.kind} /><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} />
                  {i.screenshotIds.length > 0 && <span className="chip gap-1 text-muted"><ImageIcon className="size-3.5" />{formatNumber(locale, i.screenshotIds.length)}</span>}
                  {n > 0 && <span className="chip gap-1 text-muted"><MessageSquare className="size-3.5" />{formatNumber(locale, n)}</span>}
                  <Avatar profile={assignee} size="sm" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <IssueDialog issue={open} comments={comments.filter((c) => c.issueId === open.id)} canDelete={canManage || open.reporterId === user.id} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
