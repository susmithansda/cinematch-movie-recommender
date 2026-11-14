CREATE TABLE `oauth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_accounts_provider_subject_idx` ON `oauth_accounts` (`provider`,`subject`);--> statement-breakpoint
CREATE TABLE `oauth_requests` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_requests_expiry_idx` ON `oauth_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `oauth_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_sessions_account_idx` ON `oauth_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `oauth_sessions_expiry_idx` ON `oauth_sessions` (`expires_at`);