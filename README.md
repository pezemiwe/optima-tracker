# Optima Work Tracker

A project and task tracker in the spirit of Jira, ClickUp and Asana, built for the Zenith Optima close-out and ready to grow beyond it.
One Node server, one Postgres database, and a React frontend styled with Tailwind CSS. Deploys to Render from this folder.

## What it does

| Area | Features |
|---|---|
| **Accounts** | Email and password sign-in, cookie sessions, change password (signs out other devices), profile, light/dark/auto theme. |
| **Workspaces** | Several workspaces per user, a switcher in the sidebar, rename, leave, delete. |
| **Roles** | Owner, Admin, Member, Viewer (see below). Invite-only sign-up with single-use, email-bound invite links. |
| **Projects** | Keys like `WEB-12`, colours, descriptions, leads, archive and restore, delete with name confirmation. |
| **Tasks** | Title, description, status, priority, assignee, labels, start and due date, due time, estimate, subtasks, links, watchers. |
| **Collaboration** | Comments with `@mentions`, edit and delete, a full activity history per task, workspace and project activity feeds. |
| **Notifications** | Assigned, mentioned, comment and status changes on tasks you watch; bell menu, Inbox page with overdue reminders; live unread badge. |
| **Views** | List (grouped, sortable, quick add, inline edit), Board (drag and drop with exact ordering), Calendar (drag to reschedule, unscheduled panel), Daily checklist (the original close-out view, with "Bring unfinished here"). |
| **Finding things** | Search, multi-field filters, group by status/assignee/priority/label, sort, saved views (private or shared), command palette (`Ctrl K`) that searches every project. |
| **Bulk work** | Multi-select tasks to change status, priority, assignee, due date, or delete. |
| **Reporting** | Home dashboard (my work, project progress, team workload, recent activity), Excel export per project. |
| **Settings** | Project statuses (rename, recolour, reorder, categorise, delete with move), labels, members and invites. |
| **Quality** | Keyboard shortcuts (`N`, `/`, `[`, `?`), responsive layout down to phone width, accessible dialogs and menus. |

### Roles

| Role | Can |
|---|---|
| Viewer | Read everything in the workspace. |
| Member | Create and edit tasks, comment, create projects and labels. Can delete tasks they created. |
| Admin | Everything a member can, plus manage members and invites, project settings, statuses, labels, and delete any task or comment. |
| Owner | Everything, including managing owners and deleting the workspace. A workspace always keeps at least one owner. |

## Upgrading from the original close-out checklist

The first account created on a fresh database becomes the workspace **owner**, and the original data is imported automatically into a **Daily Close-out** project (key `CLO`):

- tasks, task numbers, notes, priorities, due dates and times, creation and completion times
- workstreams become labels; statuses map to To do / In progress / Done / Merged / Closed
- owners and watchers become placeholder members, so every task keeps its assignee
- subtasks become subtasks

On an existing Render deployment the old `docs` table is read and left untouched. On a brand-new database the four starter tasks in `seed/seed.json` are used (set `SEED=off` to skip them).

When a teammate joins, the admin can pick **"Is Samuel Kolajo"** in the invite form. That person's account then takes over the imported name and all of its tasks.

## Local development

You need Node 20+ and a Postgres database.

```bash
npm ci
export DATABASE_URL=postgres://localhost/optima
npm run build
npm start            # http://localhost:3000
```

For hot reload, keep `npm start` running and in a second terminal run `npm run dev` (Vite proxies `/api` to port 3000).

### Tests

```bash
TEST_DATABASE_URL=postgres://localhost/optima_test npm test
```

The suite runs against a **real Postgres** and **drops and recreates the `public` schema** of that database, so point it at a throwaway database. It covers authentication and sessions, CSRF and rate limiting, invites and roles, workspace isolation, every task and project operation, notifications, search, bulk edits, the legacy import, and the pure logic used by the views.

## Deploy on Render

1. Push this folder to a **private** GitHub repository.
2. In Render choose **New > Blueprint**, connect GitHub, and pick the repository. Render reads `render.yaml` and proposes a web service `optima-tracker` and a Postgres database `optima-db`.
3. Click **Apply**. When the service is live, open its URL. You are asked to **set up the workspace**: create the owner account there.
4. Open **Workspace settings > Members** to invite the team. Each invite is a link; copy it and send it to the person. It is shown once, works once, only for that email address, and expires after 14 days.

Updating an existing deployment is just a push: the schema is created and migrated automatically on start, and your existing data is imported the first time the owner account is created.

If Render says you cannot have more than one active free-tier database, reuse your existing database (see below) or upgrade this one.

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Set automatically from the Render database. |
| `NODE_ENV` | recommended | `production` (set by `render.yaml`) marks cookies `Secure` and sends HSTS. |
| `SEED` | no | `off` skips the four starter tasks on a brand-new database. |
| `PGSSL` | no | `off` only if your database refuses TLS on an external URL. |
| `PORT` | no | Provided by Render. |

To use an existing database instead of creating one, delete the `databases:` block in `render.yaml` and replace the `DATABASE_URL` entry with `sync: false`, then paste your database's **Internal Database URL** into the service's environment settings.

### Plans and costs (verify on Render's pricing page)

- A **free web service** sleeps when idle and takes about a minute to wake.
- A **free database** expires after 30 days and Render allows one per account. Use a paid plan to keep data. Take a backup first: `pg_dump "<external database url>" > optima.sql`.

## Security notes

- Passwords are hashed with scrypt; sessions are random 256-bit tokens, stored only as SHA-256 hashes, in `HttpOnly`, `SameSite=Lax` cookies (`Secure` in production).
- Every write must come from the same origin and carry JSON, which blocks cross-site form posts. Logins are rate limited per address and email, and unknown emails take as long as wrong passwords.
- Access is checked on every request against the caller's workspace role. Resources in other workspaces answer `404`, so ids cannot be probed.
- Task text is rendered as plain text, links must be `http` or `https`, and the Content-Security-Policy only allows this server's own scripts.
- The rate limiter and live-update polling are per process, which is right for one Render instance.

## How it fits together

| Path | What it is |
|---|---|
| `server.js` | Entry point: connects to Postgres, applies migrations, starts Express. |
| `server/migrations/` | Versioned SQL. New files run once, in order. |
| `server/routes/` | `auth`, `workspaces`, `projects`, `tasks`, `collab` (comments, links, notifications, views). |
| `server/auth.js` | Passwords, sessions, CSRF check, rate limiting, role checks. |
| `server/legacy.js` | One-time import of the original checklist data. |
| `src/state/` | Auth/theme, and the workspace provider that polls for changes every 5 seconds. |
| `src/views/` | Project page and the List, Board, Calendar and Daily views. |
| `src/components/` | Shell, task detail panel, command palette, pickers and dialogs. |
| `src/lib/` | Pure, unit-tested logic for dates, filters and activity text. |

## Known limits

- Invitations are links you share yourself; the app does not send email.
- Attachments are links to files stored elsewhere (SharePoint, Drive, and so on), not uploads.
- Updates from other people arrive within about 5 seconds, by polling rather than a live socket.
