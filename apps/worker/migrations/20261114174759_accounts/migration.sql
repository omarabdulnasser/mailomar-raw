CREATE TABLE `send_usage` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `send_usage_pk` PRIMARY KEY(`user_id`, `day`),
	CONSTRAINT `fk_send_usage_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	CONSTRAINT `fk_passkey_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `aliases` ADD `user_id` text REFERENCES user(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `destinations` ADD `user_id` text REFERENCES user(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `destinations` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `destinations` ADD `verification_hash` text;--> statement-breakpoint
ALTER TABLE `destinations` ADD `verification_sent_at` integer;--> statement-breakpoint
ALTER TABLE `domains` ADD `shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- D1 ignores foreign_keys=OFF; deferring keeps aliases' references valid across the rebuild.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_destinations` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`email` text NOT NULL,
	`verified_at` integer,
	`verification_hash` text,
	`verification_sent_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_destinations_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- Existing destinations were verified in Cloudflare by the admin.
INSERT INTO `__new_destinations`(`id`, `email`, `verified_at`, `created_at`) SELECT `id`, `email`, `created_at`, `created_at` FROM `destinations`;--> statement-breakpoint
DROP TABLE `destinations`;--> statement-breakpoint
ALTER TABLE `__new_destinations` RENAME TO `destinations`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE UNIQUE INDEX `destinations_user_email` ON `destinations` (`user_id`,`email`);--> statement-breakpoint
CREATE INDEX `destinations_email` ON `destinations` (`email`);--> statement-breakpoint
CREATE INDEX `aliases_user_created` ON `aliases` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);