-- Multi-player: every game table gets a user_id, and its keys become per-player. Hand-written
-- from drizzle-kit's output (the snapshot is the generated one): the generated SQL added NOT NULL
-- columns without a value and copied a user_id the old tables never had. Existing rows belong to
-- the first user, who was the only one, and that user becomes the admin.
ALTER TABLE `users` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `has_premium`;--> statement-breakpoint
UPDATE `users` SET `is_admin` = 1, `name` = 'chris' WHERE `id` = (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1);--> statement-breakpoint
CREATE TABLE `invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_plans` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_plans`("user_id", "date", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "date", "created_at" FROM `plans`;--> statement-breakpoint
-- plan_items references plans by (user_id, date), which the old plans table cannot satisfy, so
-- plans is replaced first with plan_items parked in a plain copy, then plan_items is rebuilt.
CREATE TABLE `__old_plan_items` AS SELECT * FROM `plan_items`;--> statement-breakpoint
DROP TABLE `plan_items`;--> statement-breakpoint
DROP TABLE `plans`;--> statement-breakpoint
ALTER TABLE `__new_plans` RENAME TO `plans`;--> statement-breakpoint
CREATE TABLE `plan_items` (
	`user_id` text NOT NULL,
	`plan_date` text NOT NULL,
	`slot` integer NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `plan_date`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`plan_date`) REFERENCES `plans`(`user_id`,`date`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `plan_items`("user_id", "plan_date", "slot", "slug", "kind", "done") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "plan_date", "slot", "slug", "kind", "done" FROM `__old_plan_items`;--> statement-breakpoint
DROP TABLE `__old_plan_items`;--> statement-breakpoint
CREATE TABLE `__new_problem_state` (
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`first_solved_at` integer,
	`last_solved_at` integer,
	`solve_count` integer DEFAULT 0 NOT NULL,
	`last_lang` text,
	`srs_step` integer DEFAULT -1 NOT NULL,
	`due_at` integer,
	PRIMARY KEY(`user_id`, `slug`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_problem_state`("user_id", "slug", "first_solved_at", "last_solved_at", "solve_count", "last_lang", "srs_step", "due_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "slug", "first_solved_at", "last_solved_at", "solve_count", "last_lang", "srs_step", "due_at" FROM `problem_state`;--> statement-breakpoint
CREATE TABLE `__new_attempts` (
	`user_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`lang` text NOT NULL,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`lc_id` text,
	`status_msg` text,
	`accepted` integer DEFAULT false NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_attempts`("user_id", "id", "slug", "lang", "kind", "code", "lc_id", "status_msg", "accepted", "result", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "id", "slug", "lang", "kind", "code", "lc_id", "status_msg", "accepted", "result", "created_at" FROM `attempts`;--> statement-breakpoint
CREATE TABLE `__new_awards` (
	`user_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`slug` text NOT NULL,
	`lang` text NOT NULL,
	`kind` text NOT NULL,
	`research` integer NOT NULL,
	`resources` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `submission_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_awards`("user_id", "submission_id", "slug", "lang", "kind", "research", "resources", "date", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "submission_id", "slug", "lang", "kind", "research", "resources", "date", "created_at" FROM `awards`;--> statement-breakpoint
CREATE TABLE `__new_ledger` (
	`user_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ledger`("user_id", "id", "slug", "date", "kind", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "id", "slug", "date", "kind", "created_at" FROM `ledger`;--> statement-breakpoint
CREATE TABLE `__new_resources` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_resources`("user_id", "kind", "amount") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "kind", "amount" FROM `resources`;--> statement-breakpoint
CREATE TABLE `__new_buildings` (
	`user_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`city` integer DEFAULT 0 NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_buildings`("user_id", "id", "kind", "city", "x", "y", "level", "built_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "id", "kind", "city", "x", "y", "level", "built_at" FROM `buildings`;--> statement-breakpoint
CREATE TABLE `__new_game_state` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_game_state`("user_id", "key", "value", "updated_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "key", "value", "updated_at" FROM `game_state`;--> statement-breakpoint
CREATE TABLE `__new_solution_views` (
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `slug`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_solution_views`("user_id", "slug", "date", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "slug", "date", "created_at" FROM `solution_views`;--> statement-breakpoint
CREATE TABLE `__new_drill_state` (
	`user_id` text NOT NULL,
	`drill_id` text NOT NULL,
	`lang` text NOT NULL,
	`srs_step` integer DEFAULT -1 NOT NULL,
	`due_at` integer,
	`correct` integer DEFAULT 0 NOT NULL,
	`wrong` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer,
	PRIMARY KEY(`user_id`, `drill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_drill_state`("user_id", "drill_id", "lang", "srs_step", "due_at", "correct", "wrong", "last_seen_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "drill_id", "lang", "srs_step", "due_at", "correct", "wrong", "last_seen_at" FROM `drill_state`;--> statement-breakpoint
CREATE TABLE `__new_drill_attempts` (
	`user_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`drill_id` text NOT NULL,
	`date` text NOT NULL,
	`correct` integer NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_drill_attempts`("user_id", "id", "drill_id", "date", "correct", "answer", "created_at") SELECT (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), "id", "drill_id", "date", "correct", "answer", "created_at" FROM `drill_attempts`;--> statement-breakpoint
DROP TABLE `problem_state`;--> statement-breakpoint
DROP TABLE `attempts`;--> statement-breakpoint
DROP TABLE `awards`;--> statement-breakpoint
DROP TABLE `ledger`;--> statement-breakpoint
DROP TABLE `resources`;--> statement-breakpoint
DROP TABLE `buildings`;--> statement-breakpoint
DROP TABLE `game_state`;--> statement-breakpoint
DROP TABLE `solution_views`;--> statement-breakpoint
DROP TABLE `drill_state`;--> statement-breakpoint
DROP TABLE `drill_attempts`;--> statement-breakpoint
ALTER TABLE `__new_problem_state` RENAME TO `problem_state`;--> statement-breakpoint
ALTER TABLE `__new_attempts` RENAME TO `attempts`;--> statement-breakpoint
CREATE INDEX `attempts_user_slug_lang_idx` ON `attempts` (`user_id`,`slug`,`lang`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_user_draft_unique` ON `attempts` (`user_id`,`slug`,`lang`,`kind`) WHERE kind = 'draft';--> statement-breakpoint
ALTER TABLE `__new_awards` RENAME TO `awards`;--> statement-breakpoint
ALTER TABLE `__new_ledger` RENAME TO `ledger`;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_user_slug_date_unique` ON `ledger` (`user_id`,`slug`,`date`);--> statement-breakpoint
CREATE INDEX `ledger_user_date_idx` ON `ledger` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `__new_resources` RENAME TO `resources`;--> statement-breakpoint
ALTER TABLE `__new_buildings` RENAME TO `buildings`;--> statement-breakpoint
CREATE UNIQUE INDEX `buildings_user_city_xy_unique` ON `buildings` (`user_id`,`city`,`x`,`y`);--> statement-breakpoint
ALTER TABLE `__new_game_state` RENAME TO `game_state`;--> statement-breakpoint
ALTER TABLE `__new_solution_views` RENAME TO `solution_views`;--> statement-breakpoint
ALTER TABLE `__new_drill_state` RENAME TO `drill_state`;--> statement-breakpoint
ALTER TABLE `__new_drill_attempts` RENAME TO `drill_attempts`;--> statement-breakpoint
CREATE INDEX `drill_attempts_user_date_idx` ON `drill_attempts` (`user_id`,`date`);
