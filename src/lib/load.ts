import { getDemoRadar } from "./demo";
import {
  fetchCourses,
  fetchNotes,
  fetchWork,
  friendlyNotionError,
  getNotionClient,
  hasNotionToken,
  readDatabaseIds,
} from "./notion";
import type { Course, RadarData, WorkItem } from "./types";

function compactId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function courseIndex(courses: Course[]) {
  const index = new Map<string, Course>();
  for (const course of courses) {
    index.set(course.id, course);
    index.set(compactId(course.id), course);
  }
  return index;
}

export function attachCourses<T extends { courseId: string | null; courseCode: string | null }>(
  items: T[],
  courses: Course[],
): T[] {
  const index = courseIndex(courses);
  return items.map((item) => {
    if (!item.courseId) return item;
    const course = index.get(item.courseId) ?? index.get(compactId(item.courseId));
    if (!course) return item;
    return { ...item, courseId: course.id, courseCode: course.code };
  });
}

function failure(error: unknown): RadarData {
  console.error("[whats-next]", error);
  return {
    mode: "live",
    connected: false,
    courses: [],
    items: [],
    notes: [],
    error: friendlyNotionError(error),
    warning: null,
  };
}

export async function loadRadar(): Promise<RadarData> {
  if (!hasNotionToken()) return getDemoRadar();

  try {
    const notion = getNotionClient();
    const ids = readDatabaseIds();
    const [coursesResult, assignmentsResult, tasksResult, notesResult] = await Promise.allSettled([
      fetchCourses(notion, ids.courses),
      fetchWork(notion, ids.assignments, "assignment"),
      fetchWork(notion, ids.tasks, "task"),
      fetchNotes(notion, ids.notes),
    ]);

    const problems: string[] = [];
    const take = <T>(label: string, result: PromiseSettledResult<T>, fallback: T): T => {
      if (result.status === "fulfilled") return result.value;
      console.error(`[whats-next] ${label}`, result.reason);
      problems.push(`${label}: ${friendlyNotionError(result.reason)}`);
      return fallback;
    };

    const courses = take("Courses database", coursesResult, [] as Course[]).sort(
      (a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code),
    );
    const assignments = attachCourses(
      take("Assignments database", assignmentsResult, [] as WorkItem[]),
      courses,
    );
    const tasks = take("Tasks database", tasksResult, [] as WorkItem[]);
    const notes = attachCourses(notesResult.status === "fulfilled" ? notesResult.value : [], courses);
    if (notesResult.status === "rejected") console.error("[whats-next] Notes database", notesResult.reason);

    const coreFailed = problems.length > 0;
    return {
      mode: "live",
      connected: !coreFailed,
      courses,
      items: [...assignments, ...tasks].filter((item) => !item.done),
      notes,
      error: coreFailed ? problems.join(" ") : null,
      warning:
        notesResult.status === "rejected"
          ? `Notes database: ${friendlyNotionError(notesResult.reason)}`
          : null,
    };
  } catch (error) {
    return failure(error);
  }
}
