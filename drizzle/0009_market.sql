CREATE TABLE `market_prices` (
	`user_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`kind` text NOT NULL,
	`fair` real NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `epoch`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`give_kind` text NOT NULL,
	`give_amount` integer NOT NULL,
	`get_kind` text NOT NULL,
	`get_amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trades_user_epoch_idx` ON `trades` (`user_id`,`epoch`);