// Instant placeholder while a page's data loads (also lets links prefetch up to this point).
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2 sm:h-48" />
      <div className="card space-y-3 p-4">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-surface-2" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-2" />)}
        </div>
      </div>
    </div>
  );
}
