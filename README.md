# TaskTide API

Backend for **TaskTide**, a real-time Kanban board with time tracking.
Teams create boards, invite members, move cards between columns, and track the time they spend on each card.
Every change is pushed live to everyone who has the board open.

**Stack:** Node.js 24 · TypeScript · Express 5 · PostgreSQL 17 (raw SQL with `pg`) · Redis (sessions) · Socket.IO · Zod · Vitest

## Features

- **Accounts and sessions:** register and log in. Sessions are stored in Redis, logout ends them immediately, and roles are `user`, `admin` and `super_admin`.
- **Boards and members:** the owner invites people by email. Invited users accept or decline; the owner can also add someone directly.
- **Columns and cards:** create, edit, delete and drag-and-drop reorder. Cards have a priority, an assignee, a description and a completed flag.
- **Card notes:** the card's assignee writes progress notes.
- **Time tracking:** start and stop a timer on a card, with one running timer per user. Stats show time per board, card, user and day.
- **Real time:** Socket.IO rooms per board. Every change is broadcast, and members can see who is online.

## Running locally

Requirements: Node.js 24, Docker (for Postgres), and Redis (local install or a container).

```bash
cp .env.example .env          # then change SUPER_ADMIN_PASSWORD
docker compose up -d db       # Postgres on localhost:5434, schema loaded on first start
# Redis on localhost:6379, e.g.: docker run -d -p 6379:6379 redis:8-alpine
npm install
npm run dev                   # http://localhost:8000
```

On startup the API creates the super admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` if it doesn't exist yet.

### With Docker

```bash
docker compose up --build
```

This starts Postgres, Redis and the API with one command.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP and Socket.IO port |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | (required) | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Where sessions are stored |
| `SESSION_TTL_HOURS` | `168` | A session expires after this many hours without use |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend origin(s), comma separated |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | (required) | Created on startup if missing |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload (nodemon + tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | Type-check without building |
| `npm test` | Integration tests against a real Postgres and Redis |

## Project structure

```
src/
  routes/        URL -> controller
  controllers/   read and validate the request (Zod), send the response
  services/      business rules and permissions, throw AppError
  repositories/  SQL only (parameterized queries)
  sockets/       Socket.IO server (index.ts) and event broadcasting (realtime.ts)
  middleware/    auth (sessions, roles), request logger, error handler
  utils/         position math for drag and drop
db/schema.sql    tables, enums, foreign keys, indexes
tests/           Vitest + Supertest integration tests
```

A request flows through **route → controller → service → repository**.
Errors are thrown as `AppError(status, message)` and turned into JSON by one error handler.
Validation errors return `400` with a `details` list of `{ field, message }`.

## Access rules

| Who | Can |
|---|---|
| Non-member | Nothing. The board answers **404**, so outsiders can't tell it exists. |
| Member | Read everything, create and edit columns and cards, move them, track time, write notes on cards assigned to them. |
| Board owner | Everything a member can, plus rename and delete the board, delete columns and cards, and manage members (**403** for members). |
| Admin | List all users. |
| Super admin | Everything on every board, and change user roles. |

## How the interesting parts work

**Sessions in Redis.** Login creates a random 256-bit token. Redis stores `session:<sha256(token)> → userId` with an expiry, so a leaked Redis dump can't be used to log in. Each request pushes the expiry forward (`GETEX`). Logout deletes the key and closes that session's sockets. The user is loaded from Postgres on every request, so role changes take effect immediately.

**Drag and drop with fractional positions.** Columns and cards have a `float` position. Moving an item between two others gives it the midpoint (`(prev + next) / 2`), so a move updates **one row**. The client sends `{ columnId, index }` and the server works out the position. Moves run in a transaction that locks the column (or board) row with `SELECT ... FOR UPDATE`, so two simultaneous moves can't pick the same spot. When two neighbours get closer than `1e-6`, the list is renumbered to 1000, 2000, 3000… using `ROW_NUMBER()`.

**Conflicting edits.** Cards have a `version`. `PATCH /cards/:id` must send the version the client last saw. The update runs `WHERE id = $1 AND version = $2`, so if someone saved in between, the response is **409**. Moving a card doesn't change its version, so moving it never breaks someone's open edit.

**One running timer per user.** This is guaranteed by the database with a partial unique index (`ON time_entries (user_id) WHERE ended_at IS NULL`). A second start returns **409**.

**Time stats in SQL.** Every entry is cut to the requested window with `GREATEST(started_at, from)` / `LEAST(COALESCE(ended_at, now()), now())`, so running timers count up to now. `by_day` uses `generate_series` to list every day (including empty ones) and splits entries that run past midnight.

**Real-time events.** Services broadcast after the change is saved (after `COMMIT` for moves), so clients never see a change that was rolled back.

## API

All routes are under `/api`. Everything except register, login and health needs `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Postgres and Redis status (200 / 503) |
| POST | `/auth/register` | `{ name, email, password }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | End this session |
| GET / POST | `/boards` | My boards / create `{ name }` |
| GET / PATCH / DELETE | `/boards/:id` | Get / rename (owner) / delete (owner) |
| GET / POST | `/boards/:id/members` | List / add `{ email, status?: "invited" \| "active" }` (owner) |
| DELETE | `/boards/:id/members/:userId` | Remove member (owner), or leave the board yourself |
| GET | `/invitations` | My pending invitations |
| POST / DELETE | `/invitations/:boardId[/accept]` | Accept / decline |
| GET / POST | `/boards/:id/columns` | List / create `{ name }` |
| PATCH / DELETE | `/columns/:id` | Rename / delete (owner) |
| PATCH | `/columns/:id/move` | `{ index }` |
| GET | `/boards/:id/cards` | All cards of the board, in order |
| POST | `/columns/:id/cards` | `{ title, description?, priority?, assigneeId? }` |
| GET / PATCH / DELETE | `/cards/:id` | Get / edit `{ version, title?, description?, priority?, assigneeId?, completed? }` / delete (owner) |
| PATCH | `/cards/:id/move` | `{ columnId, index }` |
| GET / POST | `/cards/:id/notes` | List / add `{ content }` (assignee) |
| PATCH / DELETE | `/notes/:id` | Edit (author) / delete (author or owner) |
| GET / POST | `/cards/:id/time-entries` | List / start a timer |
| GET | `/time-entries/current` | My running timer (or `null`) |
| POST | `/time-entries/stop` | Stop my timer |
| DELETE | `/time-entries/:id` | Delete (tracker or owner) |
| GET | `/boards/:id/stats?days=30` | Board time per user, card and day |
| GET | `/cards/:id/stats` | Card time per user (all time) |
| GET | `/time-entries/stats?days=7` | My time per board and day |
| GET | `/admin/users` | All users (admin, super admin) |
| PATCH | `/admin/users/:id/role` | `{ role: "user" \| "admin" }` (super admin) |

## Real-time events (Socket.IO)

Connect with the same token as the API:

```js
const socket = io('http://localhost:8000', { auth: { token } });
const reply = await socket.emitWithAck('board:join', boardId); // { ok: true, online: [{ id, name }] }
socket.emit('board:leave', boardId);
```

Only members can join a board's room. Events sent to everyone in the room:

| Event | Payload |
|---|---|
| `presence` | `{ board_id, online: [{ id, name }] }` |
| `board:updated` / `board:deleted` | board / `{ id }` |
| `member:added` / `member:updated` / `member:removed` | member / member / `{ board_id, user_id }` |
| `column:created` / `column:updated` / `column:moved` / `column:deleted` | column / column / column / `{ id, board_id }` |
| `columns:renumbered` | `{ board_id, columns: [{ id, position }] }` |
| `card:created` / `card:updated` / `card:deleted` | card / card / `{ id, column_id }` |
| `card:moved` | card + `from_column_id` |
| `cards:renumbered` | `{ column_id, cards: [{ id, position }] }` |
| `note:created` / `note:updated` / `note:deleted` | note / note / `{ id, card_id }` |
| `timer:started` / `timer:stopped` | time entry with `user_name`, `card_title`, `board_id` |
| `time-entry:deleted` | `{ id, card_id, user_id }` |

Events sent only to the affected user: `invitation:received` (board), `board:added` (board), `board:removed` (`{ id }`).

Clients should **upsert by id**: the user who made a change gets both the HTTP response and the event, and applying the same data twice is harmless.

## Tests

```bash
npm test
```

There are 39 integration tests, covering auth and sessions, access rules (403 vs 404), version conflicts, moves and renumbering, timers, stats (including midnight splitting), admin roles and sockets (presence, live events, removed members, logout). They run against a real Postgres and Redis. They use a separate `tasktide_test` database that is recreated on every run, so your dev data is never touched. GitHub Actions runs type-check, tests and build on every push (`.github/workflows/ci.yml`).
