CREATE TABLE `movie_diary` (
	`owner_id` text NOT NULL,
	`movie_id` text NOT NULL,
	`movie_json` text NOT NULL,
	`personal_rating` integer,
	`note` text NOT NULL,
	`watched_at` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `movie_id`)
);
--> statement-breakpoint
CREATE INDEX `movie_diary_owner_date_idx` ON `movie_diary` (`owner_id`,`watched_at`);