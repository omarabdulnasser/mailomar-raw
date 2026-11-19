CREATE TABLE `reverse_contacts` (
	`key` text PRIMARY KEY,
	`alias_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_reverse_contacts_alias_id_aliases_id_fk` FOREIGN KEY (`alias_id`) REFERENCES `aliases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `aliases` ADD `sent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `reverse_contacts_alias_email` ON `reverse_contacts` (`alias_id`,`email`);