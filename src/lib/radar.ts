import { addDays, calendarDay, clockTime, todayKey } from "./dates";
import type { Priority, WorkItem } from "./types";

export type Bucket = "overdue" | "today" | "week" | "later";

export const BUCKETS: { id: Bucket; label: string; empty: string }[] = [
  { id: "overdue", label: "Overdue", empty: "Nothing overdue." },
  { id: "today", label: "Today", empty: "Nothing due today." },
  { id: "week", label: "This week", empty: "Clear for the next 7 days." },
  { id: "later", label: "Later", empty: "Nothing queued after this week." },
];

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function bucketOf(due: string | null, today = todayKey()): Bucket {
  if (!due) return "later";
  const day = calendarDay(due);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "later";
  if (day < today) return "overdue";
  if (day === today) return "today";
  if (day <= addDays(today, 7)) return "week";
  return "later";
}

function bucketRank(bucket: Bucket): number {
  if (bucket === "overdue") return 0;
  if (bucket === "today") return 1;
  if (bucket === "week") return 2;
  return 3;
}

function timeKey(due: string | null): string {
  if (!due) return "99:99";
  return clockTime(due) ?? "23:59";
}

/** Overdue first, then sooner due dates, then higher priority. */
export function compareUrgency(a: WorkItem, b: WorkItem, today = todayKey()): number {
  const bucketDiff = bucketRank(bucketOf(a.due, today)) - bucketRank(bucketOf(b.due, today));
  if (bucketDiff !== 0) return bucketDiff;
  const dayA = a.due ? calendarDay(a.due) : "9999-12-31";
  const dayB = b.due ? calendarDay(b.due) : "9999-12-31";
  if (dayA !== dayB) return dayA < dayB ? -1 : 1;
  const timeDiff = timeKey(a.due).localeCompare(timeKey(b.due));
  if (timeDiff !== 0) return timeDiff;
  const priorityDiff =
    (a.priority ? PRIORITY_RANK[a.priority] : 3) - (b.priority ? PRIORITY_RANK[b.priority] : 3);
  if (priorityDiff !== 0) return priorityDiff;
  return a.title.localeCompare(b.title);
}

export function openItems(items: WorkItem[], courseId: string): WorkItem[] {
  return items.filter((item) => {
    if (item.done) return false;
    if (courseId === "all") return true;
    return item.courseId === courseId;
  });
}

export function nextUp(items: WorkItem[], courseId: string): WorkItem[] {
  return openItems(items, courseId).sort((a, b) => compareUrgency(a, b)).slice(0, 3);
}

export function itemsInBucket(items: WorkItem[], bucket: Bucket, courseId: string): WorkItem[] {
  return openItems(items, courseId)
    .filter((item) => bucketOf(item.due) === bucket)
    .sort((a, b) => compareUrgency(a, b));
}

export function normalizePriority(value: string | null | undefined): Priority | null {
  if (!value) return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (s === "high" || s === "urgent" || s === "critical" || s === "p0" || s === "p1" || s.includes("high")) {
    return "High";
  }
  if (s === "medium" || s === "med" || s === "normal" || s === "p2" || s.includes("medium")) {
    return "Medium";
  }
  if (s === "low" || s === "minor" || s === "p3" || s.includes("low")) return "Low";
  return null;
}

export function isDoneStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === "done" || s === "complete" || s === "completed";
}

export function isActiveCourse(status: string | null | undefined): boolean {
  if (!status) return true;
  const s = status.trim().toLowerCase();
  return !(
    s === "completed" ||
    s === "complete" ||
    s === "archived" ||
    s === "inactive" ||
    s === "dropped"
  );
}
