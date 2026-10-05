-- LeetCode profile sync is gone (2026-10-05): progress here is the app's own. The username it read
-- and the per-player throttle timestamp go with it.
ALTER TABLE `users` DROP COLUMN `lc_username`;--> statement-breakpoint
DELETE FROM `game_state` WHERE `key` = 'lastSyncAt';
