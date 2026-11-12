# TaskTide API

## Stack

Node.js 24, TypeScript, Express 5, PostgreSQL 17 (raw SQL with `pg`), Redis, Socket.IO, Zod, Vitest, Docker.

## Getting started

```bash
git clone https://github.com/orewakm/tasktide_backend.git
cd tasktide_backend
docker compose up --build
```

The API runs on `http://localhost:8000` once `docker compose ps` shows it as `healthy`. No `.env` is needed.

For development with auto-reload: `cp .env.example .env`, start Postgres with `docker compose up -d db` and Redis with `docker run -d -p 6379:6379 redis:8-alpine`, then `npm install` and `npm run dev`.

## What it's for

TaskTide is the backend of a Kanban board where teams create boards, assign tasks to each other and track the time they spend on them. Every change is pushed live to everyone who has the board open.

## How it works

- **Layers:** route → controller (validates with Zod) → service (rules and permissions) → repository (SQL).
- **Auth:** login returns a token that is stored in Redis. Send it as `Authorization: Bearer <token>`.
- **Access:** non-members get `404`, members get `403` on owner-only actions (deleting, managing members), and the super admin can do everything.
- **Cards:** `PATCH /cards/:id` must send the card's `version`. If someone else saved first, the answer is `409`.
- **Timers:** one running timer per user, enforced by the database.
- **Real time:** Socket.IO with one room per board. Every change is sent as an event to everyone in the room.
- **Errors:** always JSON. Validation errors return `400` with a list of the bad fields.

## API

All routes are under `/api` and need a token, except register, login and health.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Postgres and Redis status |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Register, log in, log out |
| GET | `/auth/me` | Current user |
| GET / POST | `/boards` | My boards / create a board |
| GET / PATCH / DELETE | `/boards/:id` | Get / rename / delete a board |
| GET / POST | `/boards/:id/members` | List members / invite or add a member |
| DELETE | `/boards/:id/members/:userId` | Remove a member or leave the board |
| GET | `/invitations` | My pending invitations |
| POST / DELETE | `/invitations/:boardId[/accept]` | Accept / decline an invitation |
| GET / POST | `/boards/:id/columns` | List / create columns |
| PATCH / DELETE | `/columns/:id` | Rename / delete a column |
| PATCH | `/columns/:id/move` | Reorder a column |
| GET | `/boards/:id/cards` | All cards of a board |
| GET | `/cards` | Task list with filters, search, sorting and pagination |
| POST | `/columns/:id/cards` | Create a card |
| GET / PATCH / DELETE | `/cards/:id` | Get / edit / delete a card |
| PATCH | `/cards/:id/move` | Move a card |
| GET / POST | `/cards/:id/notes` | List / add notes |
| PATCH / DELETE | `/notes/:id` | Edit / delete a note |
| GET / POST | `/cards/:id/time-entries` | List time entries / start a timer |
| GET | `/time-entries/current` | My running timer |
| POST | `/time-entries/stop` | Stop my timer |
| DELETE | `/time-entries/:id` | Delete a time entry |
| GET | `/boards/:id/summary` | Completed and pending card counts |
| GET | `/boards/:id/stats`, `/cards/:id/stats`, `/time-entries/stats` | Tracked time per board, card or user |
| GET | `/admin/users` | All users (admin) |
| PATCH | `/admin/users/:id/role` | Change a user's role (super admin) |

## Postman

Import `postman/TaskTide.postman_collection.json`. It has one request per endpoint with its body and query parameters. Send **Login** first: it saves the token, and the create requests save the ids that the other requests use.

## Tests

`npm test` runs the integration tests against a real Postgres and Redis, using a separate `tasktide_test` database.

Proje tanıtım dokümanı (Türkçe): [PROJE_TANITIM.md](PROJE_TANITIM.md)
