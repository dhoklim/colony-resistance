CREATE TABLE `answers` (
	`participant_id` text NOT NULL,
	`question_id` integer NOT NULL,
	`option_index` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`participant_id`, `question_id`),
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "answers_question_range" CHECK("answers"."question_id" between 1 and 10),
	CONSTRAINT "answers_option_range" CHECK("answers"."option_index" between 0 and 3)
);
--> statement-breakpoint
CREATE INDEX `idx_answers_question_option` ON `answers` (`question_id`,`option_index`);--> statement-breakpoint
CREATE TABLE `draws` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`winners` text NOT NULL,
	`candidates` text NOT NULL,
	`eligible_count` integer NOT NULL,
	`drawn_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`settings` text DEFAULT '{"organizer":"","privacyContact":"","retentionDays":0,"instagramUrl":""}' NOT NULL,
	`privacy_version` integer DEFAULT 1 NOT NULL,
	`final_counts` text,
	`closed_at` text,
	CONSTRAINT "events_single_event" CHECK("events"."id" = 1),
	CONSTRAINT "events_status_valid" CHECK("events"."status" in ('draft','open','closed','drawn'))
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`student_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consent_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_student_id_unique` ON `participants` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_token_hash_unique` ON `participants` (`token_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`window_end` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_window_end` ON `rate_limits` (`window_end`);