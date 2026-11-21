import { addDays, todayKey } from "./dates";
import { demoAddedItems, demoDoneIds } from "./demo-store";
import type { Course, NoteItem, RadarData, WorkItem } from "./types";

const day = (offset: number) => addDays(todayKey(), offset);

export function seedCourses(): Course[] {
  return [
    { id: "demo-course-cse220", name: "CSE220 Data Structures", code: "CSE220", active: true },
    { id: "demo-course-cse321", name: "CSE321 Operating Systems", code: "CSE321", active: true },
    { id: "demo-course-eng102", name: "ENG102 Technical Writing", code: "ENG102", active: true },
  ];
}

export function seedItems(): WorkItem[] {
  return [
    {
      id: "demo-asn-trees",
      kind: "assignment",
      title: "Binary trees problem set",
      courseId: "demo-course-cse220",
      courseCode: "CSE220",
      due: day(-3),
      priority: "High",
      status: "In progress",
      done: false,
    },
    {
      id: "demo-asn-hash",
      kind: "assignment",
      title: "Hash table lab",
      courseId: "demo-course-cse220",
      courseCode: "CSE220",
      due: day(-1),
      priority: "Medium",
      status: "Not started",
      done: false,
    },
    {
      id: "demo-asn-sched",
      kind: "assignment",
      title: "Process scheduling quiz",
      courseId: "demo-course-cse321",
      courseCode: "CSE321",
      due: day(0),
      priority: "High",
      status: "In progress",
      done: false,
    },
    {
      id: "demo-asn-threads",
      kind: "assignment",
      title: "Threading worksheet",
      courseId: "demo-course-cse321",
      courseCode: "CSE321",
      due: day(0),
      priority: "Low",
      status: "Not started",
      done: false,
    },
    {
      id: "demo-asn-graphs",
      kind: "assignment",
      title: "Graph traversal writeup",
      courseId: "demo-course-cse220",
      courseCode: "CSE220",
      due: day(2),
      priority: "Medium",
      status: "Not started",
      done: false,
    },
    {
      id: "demo-asn-shell",
      kind: "assignment",
      title: "Shell scripting lab",
      courseId: "demo-course-cse321",
      courseCode: "CSE321",
      due: day(4),
      priority: "High",
      status: "In progress",
      done: false,
    },
    {
      id: "demo-asn-essay",
      kind: "assignment",
      title: "Technical essay draft",
      courseId: "demo-course-eng102",
      courseCode: "ENG102",
      due: day(6),
      priority: "Medium",
      status: "Not started",
      done: false,
    },
    {
      id: "demo-asn-proposal",
      kind: "assignment",
      title: "Final project proposal",
      courseId: "demo-course-cse220",
      courseCode: "CSE220",
      due: day(12),
      priority: "Low",
      status: "Not started",
      done: false,
    },
    {
      id: "demo-asn-reading",
      kind: "assignment",
      title: "Week 3 reading response",
      courseId: "demo-course-eng102",
      courseCode: "ENG102",
      due: day(-5),
      priority: "Low",
      status: "Done",
      done: true,
    },
    {
      id: "demo-task-recursion",
      kind: "task",
      title: "Review recursion slides",
      courseId: null,
      courseCode: null,
      due: day(-2),
      priority: null,
      status: "Todo",
      done: false,
    },
    {
      id: "demo-task-hours",
      kind: "task",
      title: "Draft office-hour questions",
      courseId: null,
      courseCode: null,
      due: day(0),
      priority: null,
      status: "Doing",
      done: false,
    },
    {
      id: "demo-task-sheet",
      kind: "task",
      title: "Print midterm cheat sheet",
      courseId: null,
      courseCode: null,
      due: day(3),
      priority: null,
      status: "Todo",
      done: false,
    },
    {
      id: "demo-task-feedback",
      kind: "task",
      title: "Submit course feedback",
      courseId: null,
      courseCode: null,
      due: day(-1),
      priority: null,
      status: "Done",
      done: true,
    },
  ];
}

export function seedNotes(): NoteItem[] {
  return [
    {
      id: "demo-note-trees",
      title: "Lecture 12 — trees and traversals",
      courseId: "demo-course-cse220",
      courseCode: "CSE220",
    },
    {
      id: "demo-note-sched",
      title: "Scheduling algorithms outline",
      courseId: "demo-course-cse321",
      courseCode: "CSE321",
    },
    {
      id: "demo-note-cite",
      title: "Citation style for the essay",
      courseId: "demo-course-eng102",
      courseCode: "ENG102",
    },
  ];
}

export function getDemoRadar(): RadarData {
  const done = demoDoneIds();
  const items = [...demoAddedItems(), ...seedItems()].filter((item) => !done.has(item.id) && !item.done);
  return {
    mode: "demo",
    connected: false,
    courses: seedCourses(),
    items,
    notes: seedNotes(),
    error: null,
    warning: null,
  };
}
