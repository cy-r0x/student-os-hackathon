"use client";

import { useEffect, useMemo, useState } from "react";
import { createAssignment, markDone } from "@/app/actions";
import { formatDue } from "@/lib/dates";
import { BUCKETS, itemsInBucket, nextUp, openItems, type Bucket } from "@/lib/radar";
import type { Priority, RadarData, WorkItem } from "@/lib/types";

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

const TAGS = [
  "bg-[#ddebf1] text-[#183347]",
  "bg-[#ddedea] text-[#1c3829]",
  "bg-[#eae4f2] text-[#412454]",
  "bg-[#faebdd] text-[#49290e]",
  "bg-[#f4dfeb] text-[#4c2337]",
  "bg-[#fbf3db] text-[#402c1b]",
  "bg-[#e9e5e3] text-[#442a1e]",
];

const NEUTRAL_TAG = "bg-[#e3e2e0] text-[#32302c]";

const BUCKET_STYLE: Record<Bucket, { dot: string; text: string }> = {
  overdue: { dot: "bg-overdue", text: "text-overdue" },
  today: { dot: "bg-today", text: "text-today" },
  week: { dot: "bg-week", text: "text-week" },
  later: { dot: "bg-faint", text: "text-muted" },
};

const PRIORITY_TAG: Record<Priority, string> = {
  High: "bg-[#fbe4e4] text-[#5d1715]",
  Medium: "bg-[#fbf3db] text-[#402c1b]",
  Low: "bg-[#ddebf1] text-[#183347]",
};

function planText(plan: WorkItem[], courseLabel: string | null): string {
  const header = courseLabel ? `Plan my next 2 hours (${courseLabel})` : "Plan my next 2 hours";
  const lines = plan.map((item, index) => {
    const tag = item.courseCode ?? "Task";
    const parts = [formatDue(item.due), item.priority ? `${item.priority} priority` : null].filter(Boolean);
    return `${index + 1}. [${tag}] ${item.title} (${parts.join(", ")})`;
  });
  return [header, ...lines].join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (e.g. insecure context or denied permission).
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function Dashboard({ initial }: { initial: RadarData }) {
  const [courses] = useState(initial.courses);
  const [items, setItems] = useState(initial.items);
  const [notes] = useState(initial.notes);
  const [courseId, setCourseId] = useState("all");
  const [banner, setBanner] = useState<string | null>(initial.error);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [formCourse, setFormCourse] = useState(courses.find((course) => course.active)?.id ?? courses[0]?.id ?? "");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFormOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen]);

  const tagFor = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((course, index) => map.set(course.id, TAGS[index % TAGS.length]));
    return (id: string | null) => (id ? (map.get(id) ?? NEUTRAL_TAG) : NEUTRAL_TAG);
  }, [courses]);

  const plan = useMemo(() => nextUp(items, courseId), [items, courseId]);
  const buckets = useMemo(
    () => BUCKETS.map((bucket) => ({ ...bucket, rows: itemsInBucket(items, bucket.id, courseId) })),
    [items, courseId],
  );
  const visibleNotes = useMemo(
    () => notes.filter((note) => courseId === "all" || note.courseId === courseId),
    [notes, courseId],
  );
  const selectedCourse = courses.find((course) => course.id === courseId) ?? null;
  const openCount = (id: string) => openItems(items, id).length;

  async function onDone(item: WorkItem) {
    if (item.id.startsWith("tmp-") || pendingIds.has(item.id)) return;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done: true, status: "Done" } : entry)));
    setPendingIds((current) => new Set(current).add(item.id));
    const result = await markDone(item.id, item.kind);
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    if (!result.ok) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setBanner(result.error);
      return;
    }
    setBanner(initial.error);
    setToast(`Marked “${item.title}” done`);
  }

  async function onCopyPlan() {
    if (plan.length === 0) return;
    const ok = await copyText(planText(plan, selectedCourse?.name ?? null));
    setToast(ok ? `Copied plan (${plan.length} item${plan.length === 1 ? "" : "s"}) to clipboard` : "Could not copy. Your browser blocked clipboard access.");
  }

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding) return;
    const trimmed = title.replace(/\s+/g, " ").trim();
    if (!trimmed || !formCourse) {
      setFormError("Title and course are required.");
      return;
    }
    const course = courses.find((entry) => entry.id === formCourse);
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: WorkItem = {
      id: tempId,
      kind: "assignment",
      title: trimmed,
      courseId: course?.id ?? formCourse,
      courseCode: course?.code ?? null,
      due: due || null,
      priority,
      status: "Not started",
      done: false,
    };
    setAdding(true);
    setFormError(null);
    setItems((current) => [optimistic, ...current]);
    const result = await createAssignment({
      title: trimmed,
      courseId: formCourse,
      due: due || null,
      priority,
    });
    setAdding(false);
    if (!result.ok || !result.item) {
      setItems((current) => current.filter((entry) => entry.id !== tempId));
      setFormError(result.ok ? "Notion did not return the new assignment." : result.error);
      return;
    }
    const created = result.item;
    setItems((current) =>
      current.map((entry) =>
        entry.id === tempId
          ? { ...created, courseCode: created.courseCode ?? optimistic.courseCode, courseId: created.courseId ?? optimistic.courseId }
          : entry,
      ),
    );
    setTitle("");
    setDue("");
    setPriority("Medium");
    setFormOpen(false);
    setToast(`Added “${created.title}”`);
  }

  const status =
    initial.mode === "demo"
      ? { label: "Demo mode", dot: "bg-today" }
      : initial.connected
        ? { label: "Connected to Notion Student OS", dot: "bg-done" }
        : { label: "Notion needs setup", dot: "bg-overdue" };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <RadarIcon className="size-6 rounded bg-ink p-1 text-white" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">What's Next</p>
            <p className="truncate text-[11px] text-muted">Notion Student OS</p>
          </div>
        </div>

        <SidebarLabel>Overview</SidebarLabel>
        <ul className="px-1.5">
          {buckets.map((bucket) => (
            <li key={bucket.id}>
              <a href={`#${bucket.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink/80 hover:bg-hover">
                <span className={`size-2 rounded-full ${BUCKET_STYLE[bucket.id].dot}`} />
                <span className="flex-1 truncate">{bucket.label}</span>
                <span className="text-xs text-faint tabular-nums">{bucket.rows.length}</span>
              </a>
            </li>
          ))}
        </ul>

        <SidebarLabel>Courses</SidebarLabel>
        <ul className="space-y-px px-1.5 pb-4">
          <li>
            <CourseButton active={courseId === "all"} onClick={() => setCourseId("all")} count={openCount("all")}>
              <span className="inline-flex size-5 items-center justify-center rounded bg-hover text-[11px] text-muted">∗</span>
              <span className="flex-1 truncate">All courses</span>
            </CourseButton>
          </li>
          {courses.map((course) => (
            <li key={course.id}>
              <CourseButton active={courseId === course.id} onClick={() => setCourseId(course.id)} count={openCount(course.id)}>
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10px] ${tagFor(course.id)}`}>
                  {course.code.slice(0, 3)}
                </span>
                <span className={`flex-1 truncate ${course.active ? "" : "text-faint"}`}>
                  {course.name}
                  {course.active ? "" : " · done"}
                </span>
              </CourseButton>
            </li>
          ))}
          {courses.length === 0 ? <li className="px-2 py-1 text-sm text-faint">No courses loaded</li> : null}
        </ul>

        <div className="mt-auto border-t border-line px-3 py-3 text-[11px] leading-relaxed text-faint">
          Radar clock: Asia/Dhaka
          <br />
          This week means the next 7 days
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-line/70 bg-canvas/90 px-3 backdrop-blur sm:px-4">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted">
            <span className="truncate">Student OS</span>
            <span className="text-faint">/</span>
            <span className="truncate text-ink">What's Next</span>
            {selectedCourse ? (
              <>
                <span className="text-faint">/</span>
                <span className="truncate text-ink">{selectedCourse.code}</span>
              </>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted">
              <span className={`size-1.5 rounded-full ${status.dot}`} />
              <span className="hidden sm:inline">{status.label}</span>
            </span>
            <label className="sr-only" htmlFor="course-filter">
              Filter by course
            </label>
            <select
              id="course-filter"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="max-w-40 rounded-md border border-line bg-canvas px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
            >
              <option value="all">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                  {course.active ? "" : " · completed"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <main className="mx-auto max-w-4xl px-5 pt-10 pb-24 sm:px-10 sm:pt-14 lg:px-16">
          <RadarIcon className="size-14 rounded-xl bg-sidebar p-3 text-ink" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold tracking-tight sm:text-[42px]">
                {selectedCourse ? selectedCourse.name : "What's Next"}
              </h1>
              <p className="mt-2 max-w-xl text-[15px] text-muted">
                Assignments and tasks from Notion Student OS, lined up by what will hurt if you ignore it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setFormOpen(true);
              }}
              disabled={courses.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#0077d4] disabled:opacity-50"
            >
              <PlusIcon />
              New assignment
            </button>
          </div>

          {initial.mode === "demo" ? (
            <Callout tone="yellow" icon="i" className="mt-6">
              No NOTION_TOKEN set. Showing sample Student OS data, including CSE220 Data Structures.
            </Callout>
          ) : null}

          {banner ? (
            <Callout tone="red" icon="!" className="mt-6">
              <p className="font-medium">Notion setup</p>
              <p className="mt-0.5">{banner}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 opacity-80">
                <li>Create an internal integration and set NOTION_TOKEN.</li>
                <li>Share the Student OS page with that integration.</li>
                <li>Paste each database URL into the matching NOTION_*_DB_ID.</li>
              </ul>
            </Callout>
          ) : null}

          {initial.warning ? (
            <Callout tone="yellow" icon="!" className="mt-4">
              {initial.warning}
            </Callout>
          ) : null}

          <section className="mt-8 rounded-lg bg-sidebar p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <ClockIcon />
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted uppercase">Plan my next 2 hours</p>
                  <h2 className="mt-0.5 text-lg font-semibold">
                    {plan.length === 0 ? "Nothing to plan." : plan.length === 1 ? "Do this first." : `Do these ${plan.length === 2 ? "two" : "three"} first.`}
                  </h2>
                  <p className="text-sm text-muted">Overdue, then due soon, then priority.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCopyPlan}
                disabled={plan.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink shadow-sm hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:opacity-40"
              >
                <CopyIcon />
                Copy plan
              </button>
            </div>
            {plan.length === 0 ? (
              <p className="mt-4 text-sm text-muted">You're clear. Nothing open in this view.</p>
            ) : (
              <ol className="mt-4 grid gap-2 md:grid-cols-3">
                {plan.map((item, index) => (
                  <li key={item.id} className="flex gap-3 rounded-md border border-line bg-canvas p-3 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
                    <Checkbox item={item} pending={pendingIds.has(item.id)} onDone={onDone} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-faint">{index + 1} of {plan.length}</p>
                      <p className="mt-0.5 leading-snug font-medium">{item.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <CourseTag item={item} tagFor={tagFor} />
                        {item.priority ? <Tag className={PRIORITY_TAG[item.priority]}>{item.priority}</Tag> : null}
                      </div>
                      <p className={`mt-2 text-xs ${BUCKET_STYLE[bucketFor(buckets, item.id)].text}`}>{formatDue(item.due)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {courseId !== "all" ? (
            <p className="mt-8 text-sm text-muted">Tasks are listed under All courses. This view is assignments for the selected course.</p>
          ) : null}

          <div className="mt-8 space-y-6">
            {buckets.map((bucket) => (
              <details key={bucket.id} id={bucket.id} open className="group scroll-mt-14">
                <summary className="-mx-2 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 select-none hover:bg-hover">
                  <ChevronIcon />
                  <span className={`size-2 rounded-full ${BUCKET_STYLE[bucket.id].dot}`} />
                  <h2 className="text-sm font-semibold">{bucket.label}</h2>
                  <span className="text-sm text-faint tabular-nums">{bucket.rows.length}</span>
                </summary>
                <div className="mt-1 border-t border-line">
                  {bucket.rows.length === 0 ? (
                    <p className="px-1 py-2.5 text-sm text-faint">{bucket.empty}</p>
                  ) : (
                    <ul>
                      {bucket.rows.map((item) => (
                        <li key={item.id}>
                          <Row item={item} pending={pendingIds.has(item.id)} onDone={onDone} tagFor={tagFor} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}

            <section>
              <div className="flex items-center gap-1.5 px-0 py-1">
                <NoteIcon />
                <h2 className="text-sm font-semibold">Notes</h2>
                <span className="text-sm text-faint tabular-nums">{visibleNotes.length}</span>
              </div>
              <div className="mt-1 border-t border-line pt-3">
                {visibleNotes.length === 0 ? (
                  <p className="px-1 text-sm text-faint">No notes in this view.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleNotes.map((note) => (
                      <li key={note.id} className="rounded-md border border-line p-3 text-sm hover:bg-sidebar">
                        <p className="leading-snug font-medium">{note.title}</p>
                        {note.courseCode ? <Tag className={`mt-2 ${tagFor(note.courseId)}`}>{note.courseCode}</Tag> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <p className="mt-12 text-xs text-faint lg:hidden">Radar clock: Asia/Dhaka · This week means the next 7 days</p>
        </main>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center bg-[rgba(15,15,15,0.4)] px-4 pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !adding) setFormOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="new-assignment" className="w-full max-w-lg rounded-xl bg-canvas p-5 shadow-[0_16px_48px_rgba(15,15,15,0.2)]">
            <h2 id="new-assignment" className="text-xs font-medium tracking-wide text-muted uppercase">
              New page in Assignments
            </h2>
            <form onSubmit={onCreate} className="mt-3">
              <label className="sr-only" htmlFor="assignment-title">
                Title
              </label>
              <input
                id="assignment-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
                placeholder="Untitled"
                className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-[#d3d1cb]"
              />
              <div className="mt-4 space-y-1">
                <Property label="Course">
                  <select
                    value={formCourse}
                    onChange={(event) => setFormCourse(event.target.value)}
                    required
                    disabled={courses.length === 0}
                    className="w-full rounded-md bg-transparent px-2 py-1 text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    {courses.length === 0 ? <option value="">No courses loaded</option> : null}
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                        {course.active ? "" : " · completed"}
                      </option>
                    ))}
                  </select>
                </Property>
                <Property label="Due date">
                  <input
                    type="date"
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                    className="w-full rounded-md bg-transparent px-2 py-1 text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                </Property>
                <Property label="Priority">
                  <div className="flex gap-1.5 px-1 py-0.5">
                    {PRIORITIES.map((level) => (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={priority === level}
                        onClick={() => setPriority(level)}
                        className={`rounded px-2 py-0.5 text-sm ${PRIORITY_TAG[level]} ${priority === level ? "ring-2 ring-accent/50" : "opacity-60 hover:opacity-100"}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </Property>
              </div>
              {formError ? <p className="mt-3 text-sm text-overdue">{formError}</p> : null}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={adding}
                  className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || courses.length === 0}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0077d4] disabled:opacity-50"
                >
                  {adding ? "Adding…" : "Add to Assignments"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-md bg-[#2f3437] px-3.5 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function bucketFor(buckets: { id: Bucket; rows: WorkItem[] }[], id: string): Bucket {
  return buckets.find((bucket) => bucket.rows.some((row) => row.id === id))?.id ?? "later";
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-5 pb-1 text-xs font-medium text-faint">{children}</p>;
}

function CourseButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${active ? "bg-hover font-medium text-ink" : "text-ink/80 hover:bg-hover"}`}
    >
      {children}
      <span className="text-xs text-faint tabular-nums">{count}</span>
    </button>
  );
}

function Tag({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-px text-xs whitespace-nowrap ${className}`}>{children}</span>;
}

function CourseTag({ item, tagFor }: { item: WorkItem; tagFor: (id: string | null) => string }) {
  if (item.courseCode) return <Tag className={`font-mono ${tagFor(item.courseId)}`}>{item.courseCode}</Tag>;
  return <Tag className={NEUTRAL_TAG}>Task</Tag>;
}

function Callout({
  tone,
  icon,
  className = "",
  children,
}: {
  tone: "red" | "yellow";
  icon: string;
  className?: string;
  children: React.ReactNode;
}) {
  const palette = tone === "red" ? "bg-[#fbe4e4] text-[#5d1715]" : "bg-[#fbf3db] text-[#402c1b]";
  return (
    <div className={`flex gap-3 rounded-md px-4 py-3 text-sm ${palette} ${className}`}>
      <span aria-hidden="true" className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="px-1 text-muted">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ item, pending, onDone }: { item: WorkItem; pending: boolean; onDone: (item: WorkItem) => void }) {
  return (
    <button
      type="button"
      aria-label={`Mark ${item.title} done`}
      disabled={pending || item.id.startsWith("tmp-")}
      onClick={() => onDone(item)}
      className="group/check mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-[#bdbbb6] bg-canvas text-transparent hover:border-accent hover:bg-accent hover:text-white disabled:opacity-40"
    >
      {pending ? <span className="size-2.5 animate-spin rounded-full border border-muted border-t-transparent" /> : <CheckIcon />}
    </button>
  );
}

function Row({
  item,
  pending,
  onDone,
  tagFor,
}: {
  item: WorkItem;
  pending: boolean;
  onDone: (item: WorkItem) => void;
  tagFor: (id: string | null) => string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-1 py-2 hover:bg-sidebar sm:grid sm:grid-cols-[minmax(0,1fr)_88px_190px_72px] sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <Checkbox item={item} pending={pending} onDone={onDone} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted sm:hidden">
            <CourseTag item={item} tagFor={tagFor} />
            {item.priority ? <Tag className={PRIORITY_TAG[item.priority]}>{item.priority}</Tag> : null}
            <span>{formatDue(item.due)}</span>
          </div>
        </div>
      </div>
      <div className="hidden sm:block">
        <CourseTag item={item} tagFor={tagFor} />
      </div>
      <p className="hidden truncate text-sm text-muted sm:block">{formatDue(item.due)}</p>
      <div className="hidden sm:block">
        {item.priority ? <Tag className={PRIORITY_TAG[item.priority]}>{item.priority}</Tag> : <span className="text-sm text-faint">—</span>}
      </div>
    </div>
  );
}

function RadarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      <path d="M12 12 18.4 5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-faint transition-transform group-open:rotate-90" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-faint" aria-hidden="true">
      <path d="M4 2h5.5L12 4.5V14H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 7.5h4M6 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
      <path d="M3 8.5 6.2 12 13 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
