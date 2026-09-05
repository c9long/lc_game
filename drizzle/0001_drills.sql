CREATE TABLE `drill_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`drill_id` text NOT NULL,
	`date` text NOT NULL,
	`correct` integer NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drill_attempts_date_idx` ON `drill_attempts` (`date`);--> statement-breakpoint
CREATE TABLE `drill_state` (
	`drill_id` text PRIMARY KEY NOT NULL,
	`lang` text NOT NULL,
	`srs_step` integer DEFAULT -1 NOT NULL,
	`due_at` integer,
	`correct` integer DEFAULT 0 NOT NULL,
	`wrong` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer
);
