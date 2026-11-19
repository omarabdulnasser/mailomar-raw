CREATE TABLE `message_ids` (
	`id` text PRIMARY KEY,
	`alias_id` text NOT NULL,
	`original` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_message_ids_alias_id_aliases_id_fk` FOREIGN KEY (`alias_id`) REFERENCES `aliases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `retired_addresses` (
	`address` text PRIMARY KEY,
	`user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification_mails` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_verification_mails_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `reverse_contacts` ADD `replyable` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `aliases_destination` ON `aliases` (`destination_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `destinations_token_email` ON `destinations` (`email`) WHERE "destinations"."user_id" IS NULL;--> statement-breakpoint
CREATE INDEX `destinations_verification_hash` ON `destinations` (`verification_hash`) WHERE "destinations"."verification_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `message_ids_alias_original` ON `message_ids` (`alias_id`,`original`);--> statement-breakpoint
CREATE INDEX `verification_mails_user` ON `verification_mails` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `verification_mails_email` ON `verification_mails` (`email`,`created_at`);