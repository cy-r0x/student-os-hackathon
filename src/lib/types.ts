export type Priority = "High" | "Medium" | "Low";

export type Course = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type WorkItem = {
  id: string;
  kind: "assignment" | "task";
  title: string;
  courseId: string | null;
  courseCode: string | null;
  due: string | null;
  priority: Priority | null;
  status: string | null;
  done: boolean;
};

export type NoteItem = {
  id: string;
  title: string;
  courseId: string | null;
  courseCode: string | null;
};

export type RadarData = {
  mode: "demo" | "live";
  connected: boolean;
  courses: Course[];
  items: WorkItem[];
  notes: NoteItem[];
  error: string | null;
  warning: string | null;
};

export type CreateAssignmentInput = {
  title: string;
  courseId: string;
  due: string | null;
  priority: Priority;
};

export type ActionResult =
  | { ok: true; item?: WorkItem }
  | { ok: false; error: string };
