export default function Loading() {
  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-8 md:py-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="h-3 w-32 rounded bg-muted/60" />
        <div className="h-8 w-64 rounded bg-muted/80" />
        <div className="h-4 w-96 rounded bg-muted/50" />
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-xl border bg-card/60 p-4" />
        <div className="h-28 rounded-xl border bg-card/60 p-4" />
        <div className="h-28 rounded-xl border bg-card/60 p-4" />
      </div>

      {/* Main Content Skeleton */}
      <div className="mt-4 rounded-xl border bg-card/60 p-6">
        <div className="h-6 w-48 rounded bg-muted/70 mb-4" />
        <div className="space-y-3">
          <div className="h-12 w-full rounded bg-muted/40" />
          <div className="h-12 w-full rounded bg-muted/40" />
          <div className="h-12 w-full rounded bg-muted/40" />
          <div className="h-12 w-full rounded bg-muted/40" />
        </div>
      </div>
    </div>
  )
}

