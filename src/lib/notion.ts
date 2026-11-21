import {
  APIResponseError,
  Client,
  extractDatabaseId,
  isHTTPResponseError,
} from "@notionhq/client";
import type { LooseDatabase, LoosePage, QueryList } from "./notion-types";
import { isActiveCourse, isDoneStatus, normalizePriority } from "./radar";
import {
  deriveCode,
  matchOption,
  propAt,
  readDate,
  readPlain,
  readRelationIds,
  resolveSchema,
  type PropSchema,
  type ResolvedSchema,
} from "./schema";
import type { Course, CreateAssignmentInput, NoteItem, Priority, WorkItem } from "./types";

type QueryStrategy = "database-method" | "database-request" | "data-source";

let notionClient: Client | null = null;
let queryStrategy: QueryStrategy | null = null;

type PageProperties = NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>;

export function hasNotionToken(): boolean {
  return Boolean(process.env.NOTION_TOKEN?.trim());
}

/** Student OS databases were created with this API version (properties live on the database; query is databases.query). */
export const NOTION_VERSION = "2022-06-28";

export function getNotionClient(): Client {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  if (!notionClient) {
    notionClient = new Client({
      auth: token,
      // SDK v5 defaults to 2025-09-03, which moves query onto data sources.
      // Pin 2022-06-28 so databases.query and select/relation writes match Student OS.
      notionVersion: NOTION_VERSION,
    });
  }
  return notionClient;
}

export function parseDatabaseId(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const extracted = extractDatabaseId(trimmed);
  if (extracted) return extracted;
  const match = trimmed.replace(/-/g, "").match(/[0-9a-fA-F]{32}/);
  if (!match) return null;
  const hex = match[0].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readDatabaseIds() {
  const specs = [
    ["courses", "NOTION_COURSES_DB_ID"],
    ["assignments", "NOTION_ASSIGNMENTS_DB_ID"],
    ["tasks", "NOTION_TASKS_DB_ID"],
    ["notes", "NOTION_NOTES_DB_ID"],
  ] as const;
  const ids = {} as Record<(typeof specs)[number][0], string>;
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, envName] of specs) {
    const raw = process.env[envName];
    if (!raw?.trim()) {
      missing.push(envName);
      continue;
    }
    const id = parseDatabaseId(raw);
    if (!id) invalid.push(envName);
    else ids[key] = id;
  }

  if (missing.length || invalid.length) {
    const parts: string[] = [];
    if (missing.length) parts.push(`Set ${missing.join(", ")} in .env.local.`);
    if (invalid.length) {
      parts.push(`${invalid.join(", ")} should be a Notion database URL or a 32-character ID.`);
    }
    throw new Error(parts.join(" "));
  }

  return ids;
}

export function friendlyNotionError(error: unknown): string {
  if (error instanceof Error && /^(Set |[A-Z0-9_]+ should be a Notion)/.test(error.message)) {
    return error.message;
  }
  const status = isHTTPResponseError(error) ? error.status : undefined;
  const code = APIResponseError.isAPIResponseError(error) ? error.code : undefined;
  if (status === 401 || code === "unauthorized") {
    return "Notion returned 401. Check NOTION_TOKEN — create an internal integration at https://www.notion.so/my-integrations and paste its secret.";
  }
  if (status === 403 || code === "restricted_resource") {
    return "Notion returned 403. Share the Student OS databases with your integration (open the database → Connections) and try again.";
  }
  if (status === 404 || code === "object_not_found") {
    return "Notion returned 404. Share each Student OS database with your integration and confirm the database URLs or IDs in .env.local.";
  }
  if (status === 429 || code === "rate_limited") {
    return "Notion is rate limiting requests (429). Wait a few seconds and refresh.";
  }
  if ((status && status >= 500) || code === "service_unavailable" || code === "internal_server_error") {
    return `Notion is having trouble right now (${status ?? code}). Try again in a minute.`;
  }
  if (code === "validation_error") {
    const message = error instanceof Error ? error.message : "";
    return `Notion rejected the request: ${message || "check that the Student OS properties still match"}.`;
  }
  const detail = error instanceof Error ? error.message : "unknown error";
  return `Could not reach Notion (${detail}). Check the token, the four database IDs, and that the integration can access the Student OS.`;
}

function shouldUseDataSource(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /data[_ ]?source/i.test(message);
}

/**
 * Query a Student OS database with databases.query.
 * @notionhq/client v5 dropped the databases.query method, so we call it when
 * present and otherwise POST /databases/:id/query with Notion-Version 2022-06-28.
 * dataSources.query is only used if Notion says the database was moved there.
 */
async function queryPage(
  notion: Client,
  databaseId: string,
  dataSourceId: string | undefined,
  cursor?: string,
): Promise<QueryList> {
  const page = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
  const databases = notion.databases as typeof notion.databases & {
    query?: (args: { database_id: string; page_size?: number; start_cursor?: string }) => Promise<QueryList>;
  };

  if (queryStrategy !== "database-request" && queryStrategy !== "data-source" && typeof databases.query === "function") {
    try {
      const result = await databases.query({ database_id: databaseId, ...page });
      queryStrategy = "database-method";
      return result;
    } catch (error) {
      if (!shouldUseDataSource(error)) throw error;
    }
  }

  if (queryStrategy !== "data-source") {
    try {
      const result = await notion.request<QueryList>({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: page,
      });
      queryStrategy = "database-request";
      return result;
    } catch (error) {
      if (!shouldUseDataSource(error)) throw error;
    }
  }

  if (!dataSourceId) {
    throw new Error("This Notion SDK has no working databases.query, and the database has no data source to query.");
  }

  queryStrategy = "data-source";
  const listed = await notion.dataSources.query({
    data_source_id: dataSourceId,
    page_size: 100,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
  return listed as QueryList;
}

async function queryAll(notion: Client, databaseId: string, dataSourceId?: string): Promise<LoosePage[]> {
  const pages: LoosePage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const list = await queryPage(notion, databaseId, dataSourceId, cursor);
    pages.push(...(list.results ?? []));
    if (!list.has_more || !list.next_cursor) break;
    cursor = list.next_cursor;
  }
  return pages.filter((item) => {
    if (item.object && item.object !== "page") return false;
    if (!item.id || !item.properties) return false;
    if (item.archived || item.in_trash) return false;
    return true;
  });
}

async function loadSchema(notion: Client, databaseId: string) {
  const database = (await notion.databases.retrieve({ database_id: databaseId })) as LooseDatabase;
  const dataSourceId = database.data_sources?.find((source) => source.id)?.id;
  let properties = database.properties;
  if (!properties || Object.keys(properties).length === 0) {
    if (dataSourceId) {
      const dataSource = (await notion.dataSources.retrieve({ data_source_id: dataSourceId })) as LooseDatabase;
      properties = dataSource.properties;
    }
  }
  return { schema: resolveSchema(properties), dataSourceId };
}

function mapCourse(page: LoosePage, schema: ResolvedSchema): Course | null {
  if (!page.id) return null;
  const name = readPlain(propAt(page.properties, schema.title)) || "Untitled course";
  const explicitCode = readPlain(propAt(page.properties, schema.code));
  const status = readPlain(propAt(page.properties, schema.status)) || null;
  return {
    id: page.id,
    name,
    code: deriveCode(name, explicitCode),
    active: isActiveCourse(status),
  };
}

function mapWork(page: LoosePage, schema: ResolvedSchema, kind: WorkItem["kind"]): WorkItem | null {
  if (!page.id) return null;
  const status = readPlain(propAt(page.properties, schema.status)) || null;
  return {
    id: page.id,
    kind,
    title: readPlain(propAt(page.properties, schema.title)) || "Untitled",
    courseId: readRelationIds(propAt(page.properties, schema.course))[0] ?? null,
    courseCode: null,
    due: readDate(propAt(page.properties, schema.due)),
    priority: normalizePriority(readPlain(propAt(page.properties, schema.priority)) || null),
    status,
    done: isDoneStatus(status),
  };
}

function mapNote(page: LoosePage, schema: ResolvedSchema): NoteItem | null {
  if (!page.id) return null;
  return {
    id: page.id,
    title: readPlain(propAt(page.properties, schema.title)) || "Untitled note",
    courseId: readRelationIds(propAt(page.properties, schema.course))[0] ?? null,
    courseCode: null,
  };
}

export async function fetchCourses(notion: Client, databaseId: string): Promise<Course[]> {
  const { schema, dataSourceId } = await loadSchema(notion, databaseId);
  const pages = await queryAll(notion, databaseId, dataSourceId);
  return pages.flatMap((page) => {
    const course = mapCourse(page, schema);
    return course ? [course] : [];
  });
}

export async function fetchWork(
  notion: Client,
  databaseId: string,
  kind: WorkItem["kind"],
): Promise<WorkItem[]> {
  const { schema, dataSourceId } = await loadSchema(notion, databaseId);
  const pages = await queryAll(notion, databaseId, dataSourceId);
  return pages.flatMap((page) => {
    const item = mapWork(page, schema, kind);
    return item ? [item] : [];
  });
}

export async function fetchNotes(notion: Client, databaseId: string): Promise<NoteItem[]> {
  const { schema, dataSourceId } = await loadSchema(notion, databaseId);
  const pages = await queryAll(notion, databaseId, dataSourceId);
  return pages.flatMap((page) => {
    const note = mapNote(page, schema);
    return note ? [note] : [];
  });
}

function statusValue(schema: PropSchema, label: string): Record<string, unknown> {
  if (schema.type === "status") return { status: { name: label } };
  if (schema.type === "rich_text") {
    return { rich_text: [{ text: { content: label } }] };
  }
  return { select: { name: label } };
}

function assertPageId(id: string) {
  if (!/^[0-9a-f]{32}$/i.test(id.replace(/-/g, ""))) {
    throw new Error("That item is not a Notion page.");
  }
}

export async function markDonePage(pageId: string, kind: WorkItem["kind"]) {
  assertPageId(pageId);
  const notion = getNotionClient();
  const ids = readDatabaseIds();
  const databaseId = kind === "assignment" ? ids.assignments : ids.tasks;
  const { schema } = await loadSchema(notion, databaseId);
  if (!schema.status) {
    throw new Error("No Status property was found. Add a select or status property named Status.");
  }
  const label = matchOption(schema.status.options, ["done", "complete", "completed"]) ?? "Done";
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [schema.status.name]: statusValue(schema.status, label),
    } as PageProperties,
  });
}

async function createPage(
  notion: Client,
  databaseId: string,
  dataSourceId: string | undefined,
  properties: Record<string, unknown>,
) {
  const body = properties as PageProperties;
  if (queryStrategy === "data-source" && dataSourceId) {
    return notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: body,
    });
  }
  try {
    return await notion.pages.create({
      parent: { database_id: databaseId },
      properties: body,
    });
  } catch (error) {
    if (!dataSourceId || !shouldUseDataSource(error)) throw error;
    queryStrategy = "data-source";
    return notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: body,
    });
  }
}

function choiceValue(schema: PropSchema, label: string): Record<string, unknown> {
  if (schema.type === "status") return { status: { name: label } };
  return { select: { name: label } };
}

export async function createAssignmentPage(input: CreateAssignmentInput & { priority: Priority }): Promise<WorkItem> {
  assertPageId(input.courseId);
  const notion = getNotionClient();
  const ids = readDatabaseIds();
  const { schema, dataSourceId } = await loadSchema(notion, ids.assignments);
  if (!schema.title) throw new Error("The Assignments database has no title property.");

  const properties: Record<string, unknown> = {
    [schema.title.name]: {
      title: [{ text: { content: input.title } }],
    },
  };

  if (schema.course) {
    properties[schema.course.name] = { relation: [{ id: input.courseId }] };
  }
  if (schema.due && input.due) {
    properties[schema.due.name] = { date: { start: input.due } };
  }
  if (schema.priority) {
    const label = schema.priority.options.length
      ? matchOption(schema.priority.options, [input.priority])
      : input.priority;
    if (label) properties[schema.priority.name] = choiceValue(schema.priority, label);
  }
  if (schema.status) {
    const label = schema.status.options.length
      ? matchOption(schema.status.options, ["not started", "todo", "to do", "to-do"])
      : "Not started";
    if (label) properties[schema.status.name] = statusValue(schema.status, label);
  }

  const page = await createPage(notion, ids.assignments, dataSourceId, properties);
  return {
    id: page.id,
    kind: "assignment",
    title: input.title,
    courseId: input.courseId,
    courseCode: null,
    due: input.due,
    priority: input.priority,
    status: "Not started",
    done: false,
  };
}
