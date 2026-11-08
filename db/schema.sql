CREATE TYPE "user_role" AS ENUM (
  'user',
  'admin',
  'super_admin'
);

CREATE TYPE "card_priority" AS ENUM (
  'low',
  'medium',
  'high'
);

CREATE TYPE "member_status" AS ENUM (
  'invited',
  'active'
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(100) NOT NULL,
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "role" user_role NOT NULL DEFAULT 'user',
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "deleted_at" timestamptz
);

CREATE TABLE "boards" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(100) NOT NULL,
  "owner_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "deleted_at" timestamptz
);

CREATE TABLE "board_members" (
  "board_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" member_status NOT NULL DEFAULT 'invited',
  PRIMARY KEY ("board_id", "user_id")
);

CREATE TABLE "columns" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "board_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "position" float NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE "cards" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "column_id" uuid NOT NULL,
  "assignee_id" uuid,
  "title" varchar(200) NOT NULL,
  "description" text,
  "priority" card_priority NOT NULL DEFAULT 'medium',
  "position" float NOT NULL,
  "version" int NOT NULL DEFAULT 1,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "deleted_at" timestamptz
);

CREATE TABLE "card_notes" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "card_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "time_entries" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "card_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT (now()),
  "ended_at" timestamptz
);

COMMENT ON COLUMN "users"."deleted_at" IS 'null = active, set = soft deleted';

COMMENT ON COLUMN "board_members"."status" IS 'invited = waiting for the user to accept, active = has access';

COMMENT ON COLUMN "columns"."name" IS 'e.g. To Do, In Progress, Done';

COMMENT ON COLUMN "columns"."position" IS 'fractional order, left to right';

COMMENT ON COLUMN "cards"."position" IS 'fractional order, top to bottom';

COMMENT ON COLUMN "cards"."version" IS 'increases on every edit, used to detect conflicting edits';

COMMENT ON COLUMN "cards"."completed_at" IS 'null = not completed';

COMMENT ON TABLE "time_entries" IS 'One running timer per user: unique index on (user_id) WHERE ended_at IS NULL';

COMMENT ON COLUMN "time_entries"."ended_at" IS 'null while the timer is running';

ALTER TABLE "boards" ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "board_members" ADD FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "board_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "columns" ADD FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cards" ADD FOREIGN KEY ("column_id") REFERENCES "columns" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cards" ADD FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "card_notes" ADD FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "card_notes" ADD FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "time_entries" ADD FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "time_entries" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX one_running_timer_per_user
  ON time_entries (user_id)
  WHERE ended_at IS NULL;