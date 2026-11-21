import type { WorkItem } from "./types";

const doneIds = new Set<string>();
const added: WorkItem[] = [];

export function demoDoneIds(): Set<string> {
  return doneIds;
}

export function demoAddedItems(): WorkItem[] {
  return added;
}

export function rememberDemoDone(id: string) {
  doneIds.add(id);
}

export function rememberDemoItem(item: WorkItem) {
  added.unshift(item);
}
