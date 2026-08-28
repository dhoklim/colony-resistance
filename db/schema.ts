import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey(),
    status: text("status").notNull().default("draft"),
    round: integer("round").notNull().default(1),
    settings: text("settings")
      .notNull()
      .default(
        '{"organizer":"","privacyContact":"","retentionDays":0,"instagramUrl":""}',
      ),
    privacyVersion: integer("privacy_version").notNull().default(1),
    finalCounts: text("final_counts"),
    closedAt: text("closed_at"),
  },
  (table) => [
    check("events_single_event", sql`${table.id} = 1`),
    check(
      "events_status_valid",
      sql`${table.status} in ('draft','open','closed','drawn')`,
    ),
  ],
);

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  consentVersion: integer("consent_version").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const answers = sqliteTable(
  "answers",
  {
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    questionId: integer("question_id").notNull(),
    optionIndex: integer("option_index").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.participantId, table.questionId] }),
    check("answers_question_range", sql`${table.questionId} between 1 and 10`),
    check("answers_option_range", sql`${table.optionIndex} between 0 and 3`),
    index("idx_answers_question_option").on(
      table.questionId,
      table.optionIndex,
    ),
  ],
);

export const draws = sqliteTable("draws", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id),
  winners: text("winners").notNull(),
  candidates: text("candidates").notNull(),
  eligibleCount: integer("eligible_count").notNull(),
  drawnAt: text("drawn_at").notNull(),
});

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    hits: integer("hits").notNull(),
    windowEnd: integer("window_end").notNull(),
  },
  (table) => [index("idx_rate_limits_window_end").on(table.windowEnd)],
);
