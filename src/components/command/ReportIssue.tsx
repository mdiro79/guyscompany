'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { ImagePlus, X, Loader2, Bug, Wrench } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useShell } from '@/components/shell/ShellContext';
import { reportIssueAction } from '@/app/actions/command';
import { uploadFile } from '@/lib/upload';
import { MAX_FILE_BYTES } from '@/lib/limits';
import type { IssueKind, Severity } from '@/lib/data/types';
import { SeverityBadge } from './badges';

const MAX_SHOTS = 6;
interface Shot { key: string; preview: string; id: string | null; failed?: boolean }

// Screenshots for a bug: choose, drop or paste images; each uploads at once and shows a preview.
export function ShotPicker({ shots, setShots }: { shots: Shot[]; setShots: (f: (s: Shot[]) => Shot[]) => void }) {
  const t = useTranslations('command.form');
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const add = (files: File[]) => {
    setError(null);
    const images = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_FILE_BYTES).slice(0, MAX_SHOTS - shots.length);
    if (files.length && !images.length) setError(t('maxShots'));
    for (const f of images) {
      const key = crypto.randomUUID();
      setShots((s) => [...s, { key, preview: URL.createObjectURL(f), id: null }]);
      uploadFile(f).then(
        (id) => setShots((s) => s.map((x) => (x.key === key ? { ...x, id } : x))),
        () => { setError(t('uploadFailed')); setShots((s) => s.map((x) => (x.key === key ? { ...x, failed: true } : x))); },
      );
    }
  };
  // Ctrl+V of a screenshot anywhere while the form is open.
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  });
  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap gap-2">
        {shots.map((s) => (
          <div key={s.key} className={clsx('relative size-20 overflow-hidden rounded-xl border', s.failed ? 'border-danger' : 'border-line')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.preview} alt="" className="size-full object-cover" />
            {!s.id && !s.failed && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Loader2 className="size-5 animate-spin" /></span>}
            <button type="button" onClick={() => setShots((x) => x.filter((y) => y.key !== s.key))} aria-label="remove"
              className="absolute top-1 end-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-3.5" /></button>
          </div>
        ))}
        {shots.length < MAX_SHOTS && (
          <button type="button" onClick={() => input.current?.click()}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs text-muted hover:border-brand hover:text-brand">
            <ImagePlus className="size-5" />{t('addShots')}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <p className="mt-1 text-xs text-muted">{error ?? <>{t('pasteHint')}<br />{t('maxShots')}</>}</p>
    </div>
  );
}

export function ReportIssueDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const t = useTranslations('command');
  const tf = useTranslations('command.form');
  const { profiles } = useShell();
  const [kind, setKind] = useState<IssueKind>('bug');
  const [severity, setSeverity] = useState<Severity>(1);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const uploading = shots.some((s) => !s.id && !s.failed);
  const reset = () => { setKind('bug'); setSeverity(1); setShots([]); setError(false); };
  const submit = (form: FormData) => {
    setError(false);
    start(async () => {
      const r = await reportIssueAction(projectId, {
        kind, severity, title: String(form.get('title') ?? ''), description: String(form.get('description') ?? ''), steps: String(form.get('steps') ?? ''),
        assigneeId: String(form.get('assigneeId') ?? '') || null, screenshotIds: shots.map((s) => s.id).filter((x): x is string => !!x),
      }).catch(() => null);
      if (r?.ok) { reset(); onClose(); } else setError(true);
    });
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('reportBug')} wide>
      <form action={submit} className="space-y-3">
        <div className="flex gap-2">
          {(['bug', 'defect'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={clsx('flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border text-sm', kind === k ? 'border-brand bg-brand-soft text-brand' : 'border-line')}>
              {k === 'bug' ? <Bug className="size-4" /> : <Wrench className="size-4" />}{t(`kind.${k}`)}
            </button>
          ))}
        </div>
        <div><label className="label">{tf('title')}</label><input name="title" required maxLength={160} className="input" dir="auto" placeholder={tf('titlePh')} /></div>
        <div>
          <span className="label">{tf('severity')}</span>
          <div className="grid grid-cols-4 gap-1.5">
            {([0, 1, 2, 3] as const).map((n) => (
              <button key={n} type="button" onClick={() => setSeverity(n)} aria-pressed={severity === n}
                className={clsx('flex min-h-10 items-center justify-center rounded-xl border', severity === n ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100')}>
                <SeverityBadge severity={n} />
              </button>
            ))}
          </div>
        </div>
        <div><label className="label">{tf('description')}</label><textarea name="description" rows={3} className="input py-2" dir="auto" /></div>
        <div><label className="label">{tf('steps')}</label><textarea name="steps" rows={3} className="input py-2" dir="auto" placeholder={tf('stepsPh')} /></div>
        <div><label className="label">{tf('assignee')}</label>
          <select name="assigneeId" className="input" defaultValue=""><option value="">{tf('nobody')}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></div>
        <div><span className="label">{tf('screenshots')}</span><ShotPicker shots={shots} setShots={setShots} /></div>
        {error && <p className="text-sm text-danger" role="alert">{tf('uploadFailed')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{tf('cancel')}</button>
          <button className="btn-primary" disabled={pending || uploading}>{uploading ? <><Loader2 className="size-4 animate-spin" />{tf('uploading')}</> : tf('submit')}</button>
        </div>
      </form>
    </Dialog>
  );
}
