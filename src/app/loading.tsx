export default function Loading() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-sidebar lg:block" />
      <main className="flex-1 px-6 py-16 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-4xl">
          <div className="size-12 animate-pulse rounded-lg bg-hover" />
          <h1 className="mt-4 text-4xl font-bold tracking-tight">What's Next</h1>
          <p className="mt-3 text-muted">Reading Courses, Assignments, Tasks, and Notes…</p>
          <div className="mt-10 space-y-3">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-9 animate-pulse rounded-md bg-sidebar" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
