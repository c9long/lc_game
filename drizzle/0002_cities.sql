DROP INDEX `buildings_xy_unique`;--> statement-breakpoint
ALTER TABLE `buildings` ADD `city` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `buildings_city_xy_unique` ON `buildings` (`city`,`x`,`y`);