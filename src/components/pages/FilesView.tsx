'use client';
import { useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { deleteFileAction } from '@/app/actions/calendar';
import { formatBytes, formatDate } from '@/lib/format';
import { MAX_FILE_BYTES } from '@/lib/limits';
import { uploadFile } from '@/lib/upload';
import type { FileMeta } from '@/lib/data/types';

export function FilesView({ files }: { files: FileMeta[] }) {
  const t = useTranslations('files');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { user, profiles } = useShell();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, start] = useTransition();
  const upload = async (file: File) => {
    setError('');
    if (file.size > MAX_FILE_BYTES) { setError(t('maxSize')); return; }
    setBusy(true);
    try { await uploadFile(file); router.refresh(); } catch { setError(tc('error')); }
    setBusy(false);
  };
  return (
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <span className="text-xs text-muted">{t('maxSize')}</span>
        <button type="button" className="btn-primary ms-auto min-h-10" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4" />{t('upload')}</button>
        <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {files.length === 0 ? <p className="py-10 text-center text-sm text-muted">{t('empty')}</p> : (
        <ul className="divide-y divide-line">
          {files.map((f) => {
            const by = profiles.find((p) => p.id === f.uploadedBy) ?? null;
            return (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><FileText className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" dir="ltr">{f.name}</div>
                  <div className="text-xs text-muted">{formatBytes(locale, f.size)} · {formatDate(locale, f.createdAt)}</div>
                </div>
                <span className="hidden sm:inline-flex"><Avatar profile={by} size="sm" /></span>
                <a href={`/api/files/${f.id}`} className="icon-btn" aria-label={t('download')}><Download className="size-5" /></a>
                {(user.role === 'admin' || f.uploadedBy === user.id) && (
                  <button type="button" className="icon-btn text-muted hover:text-danger" aria-label={tc('delete')}
                    onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteFileAction(f.id); }); }}><Trash2 className="size-5" /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
