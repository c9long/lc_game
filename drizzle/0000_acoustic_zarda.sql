CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`lang` text NOT NULL,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`lc_id` text,
	`status_msg` text,
	`accepted` integer DEFAULT false NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_slug_lang_idx` ON `attempts` (`slug`,`lang`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_draft_unique` ON `attempts` (`slug`,`lang`,`kind`) WHERE kind = 'draft';--> statement-breakpoint
CREATE TABLE `awards` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`lang` text NOT NULL,
	`kind` text NOT NULL,
	`research` integer NOT NULL,
	`resources` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`built_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buildings_xy_unique` ON `buildings` (`x`,`y`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_slug_date_unique` ON `ledger` (`slug`,`date`);--> statement-breakpoint
CREATE INDEX `ledger_date_idx` ON `ledger` (`date`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_items` (
	`plan_date` text NOT NULL,
	`slot` integer NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`plan_date`, `slot`),
	FOREIGN KEY (`plan_date`) REFERENCES `plans`(`date`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`date` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `problem_state` (
	`slug` text PRIMARY KEY NOT NULL,
	`first_solved_at` integer,
	`last_solved_at` integer,
	`solve_count` integer DEFAULT 0 NOT NULL,
	`last_lang` text,
	`srs_step` integer DEFAULT -1 NOT NULL,
	`due_at` integer
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`slug` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`title` text NOT NULL,
	`difficulty` text NOT NULL,
	`content_html` text,
	`tags` text NOT NULL,
	`snippets` text NOT NULL,
	`example_testcases` text,
	`is_paid_only` integer DEFAULT false NOT NULL,
	`editorial_free` integer DEFAULT false NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`kind` text PRIMARY KEY NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `solution_views` (
	`slug` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`slug`, `date`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`lc_username` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`has_premium` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
