"use server";

import { rememberDemoDone, rememberDemoItem } from "@/lib/demo-store";
import { seedCourses } from "@/lib/demo";
import { createAssignmentPage, friendlyNotionError, hasNotionToken, markDonePage } from "@/lib/notion";
import type { ActionResult, CreateAssignmentInput, Priority, WorkItem } from "@/lib/types";

function cleanTitle(value: string): string | null {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title || title.length > 200) return null;
  return title;
}

function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.replace(/-/g, ""));
}

export async function markDone(id: string, kind: WorkItem["kind"]): Promise<ActionResult> {
  if (!id || (kind !== "assignment" && kind !== "task")) {
    return { ok: false, error: "Missing item." };
  }
  if (!hasNotionToken()) {
    rememberDemoDone(id);
    return { ok: true };
  }
  if (!isNotionPageId(id)) {
    return { ok: false, error: "That item is not a Notion page." };
  }
  try {
    await markDonePage(id, kind);
    return { ok: true };
  } catch (error) {
    console.error("[whats-next] mark done", error);
    return { ok: false, error: friendlyNotionError(error) };
  }
}

export async function createAssignment(input: CreateAssignmentInput): Promise<ActionResult> {
  const title = cleanTitle(input?.title ?? "");
  if (!title) return { ok: false, error: "Give the assignment a title." };
  const priority = input.priority as Priority;
  if (priority !== "High" && priority !== "Medium" && priority !== "Low") {
    return { ok: false, error: "Pick a priority." };
  }
  const due = input.due?.trim() ? input.due.trim() : null;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "Use a valid due date." };
  }
  if (!input.courseId) return { ok: false, error: "Pick a course." };

  if (!hasNotionToken()) {
    const course = seedCourses().find((item) => item.id === input.courseId);
    if (!course) return { ok: false, error: "Pick a course from the list." };
    const item: WorkItem = {
      id: `demo-asn-${crypto.randomUUID()}`,
      kind: "assignment",
      title,
      courseId: course.id,
      courseCode: course.code,
      due,
      priority,
      status: "Not started",
      done: false,
    };
    rememberDemoItem(item);
    return { ok: true, item };
  }

  if (!isNotionPageId(input.courseId)) {
    return { ok: false, error: "Pick a course from your Courses database." };
  }

  try {
    const item = await createAssignmentPage({ title, courseId: input.courseId, due, priority });
    return { ok: true, item };
  } catch (error) {
    console.error("[whats-next] create assignment", error);
    return { ok: false, error: friendlyNotionError(error) };
  }
}
