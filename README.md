# What's Next

A deadline radar for Notion Student OS — see what's overdue, due today, and what to do in the next two hours.

## Problem

Notion Student OS splits schoolwork across Assignments and Tasks. Deadlines sit in two databases, so the next thing to do is easy to miss. What's Next reads both, drops anything already Done, and sorts the rest into Overdue, Today, This week, and Later.

## Features

- Dashboard sections for Overdue, Today, This week (the next 7 days), and Later, merged from Assignments and Tasks.
- Each open item shows its title, course code chip, due date, and priority. Filter the radar by course.
- **Plan my next 2 hours** picks the top 3 items: overdue first, then due soon, then priority. **Copy plan** copies it as plain text with a confirmation toast.
- Mark done updates the Status property to Done in Notion, with optimistic UI.
- Add an assignment (title, course, due date, priority) and create the page in Assignments with the Course relation.
- Demo mode when `NOTION_TOKEN` is missing, with sample courses including CSE220 Data Structures. Friendly setup hints for Notion 401 and 404 errors.
- Header reads **Connected to Notion Student OS** when the live databases load.

## How it uses Notion Student OS

What's Next is a live view of the four Student OS databases:

| Database | What we use |
| --- | --- |
| Courses | Name (title, e.g. CSE220 Data Structures), Code (text, e.g. CSE220), Status (Active / Completed) |
| Assignments | Name, Course relation, Due date, Status (Not started / In progress / Done), Priority (High / Medium / Low) |
| Tasks | Name, Status (Todo / Doing / Done), Due date |
| Notes | Title, Course relation |

Course code chips come from the Courses database through the Course relation on Assignments and Notes. The page loads all four databases on the server. Mark done and add assignment write back to Notion (`pages.update` for Status, `pages.create` for a new assignment with the relation). Property names are matched by type and name, so a Status property typed as `select` or `status` still maps. The client pins `Notion-Version: 2022-06-28` and calls `databases.query` (the SDK method when it exists, otherwise `POST /databases/:id/query`) so it matches databases created with that API version.

## Setup

1. Open your Notion Student OS (or duplicate the template).
2. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy the secret.
3. On the Student OS page, choose **Share → Connections** and add that integration so it can read and update the databases.
4. Copy each database URL (Courses, Assignments, Tasks, Notes).
5. Configure env vars:

```bash
cp .env.example .env.local
```

Fill in `NOTION_TOKEN`, `NOTION_COURSES_DB_ID`, `NOTION_ASSIGNMENTS_DB_ID`, `NOTION_TASKS_DB_ID`, and `NOTION_NOTES_DB_ID`. Each ID can be a full Notion URL or the raw 32-character id.

6. Install and run:

```bash
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Leave `NOTION_TOKEN` empty to use demo mode.

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- `@notionhq/client` (server-side only, Notion-Version `2022-06-28`)

## How we built it

What's Next started as my idea: a deadline radar for Notion Student OS that brings assignments and tasks together in one place, making it easier for students to see what needs attention and decide what to work on next.

I came up with the concept, defined the problem, and envisioned the features and overall experience. Devin built the entire application from scratch, turning that idea into a working product.

From the initial research and Notion Student OS database structure to the Notion API integration, backend architecture, date and deadline logic, demo mode, and complete Next.js dashboard, Devin handled the implementation.

It also designed and developed the frontend, creating a clean, light, Notion-inspired interface with a sidebar, course filters, deadline sections, planning cards, and an assignment creation dialog.

The result is a complete application that connects directly to Notion Student OS, reads from all four databases, and supports real-time updates through Notion's API.

## How we used Devin Chat

Devin was responsible for building What's Next end to end, starting with my original idea and taking it all the way to a working application.

Rather than starting with an existing codebase, Devin built the project from scratch, including the application structure, components, server actions, Notion client, database integration, and user interface.

Throughout development, Devin handled:

- **Research and planning:** Understanding the Notion Student OS structure and translating the idea into a practical application.
- **Notion integration:** Building the Notion API client, connecting all four databases, mapping properties by type and name, and implementing read and write operations.
- **Backend development:** Implementing deadline calculations, sorting, filtering, demo data, server actions, and error handling.
- **Frontend development:** Designing and building the complete dashboard with a light, Notion-style interface, responsive layouts, course filters, and collapsible deadline sections.
- **Core features:** Implementing the next-two-hours planner, Copy plan functionality, mark-as-done actions, and the new assignment dialog.
- **Testing and refinement:** Reviewing the implementation, fixing bugs, improving timezone handling, refining error messages, and ensuring the production build succeeds.

### What Devin implemented and refined

- **Timezone-aware sorting:** Items due on the same day are now ordered using Asia/Dhaka time rather than raw UTC timestamps.
- **Datetime handling:** Datetimes without timezone offsets are treated as wall-clock time to prevent incorrect date calculations.
- **Due-time display:** Deadlines show readable dates and times in Dhaka time.
- **Reliable error handling:** Database loading errors remain visible even after successful item updates.
- **Better Notion errors:** Rate limits (429), server outages (5xx), and validation errors receive clearer messages.
- **Dynamic planning:** The plan heading adjusts automatically depending on whether there are three, two, one, or no items to plan.

### Copy plan

Devin also implemented the **Copy plan** feature, allowing students to copy their next two hours of work as plain text. Each numbered item includes its course code, due date, and priority. When a course filter is active, the plan also includes the course name.

A confirmation toast appears after copying, with a fallback for browsers where the Clipboard API is unavailable.

### Final result

The entire application was built by Devin from scratch based on my original idea. I provided the vision; Devin handled the research, architecture, development, design, implementation, and refinement.

The project uses Next.js, TypeScript, Tailwind CSS, and the Notion API. The existing Notion database schema and environment variable names remain unchanged.

The final production build passes with `npm run build`.

## License

MIT
