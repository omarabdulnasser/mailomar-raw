CREATE TABLE `aliases` (
	`id` text PRIMARY KEY,
	`address` text NOT NULL UNIQUE,
	`domain_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`forwarded_count` integer DEFAULT 0 NOT NULL,
	`blocked_count` integer DEFAULT 0 NOT NULL,
	`last_email_at` integer,
	CONSTRAINT `fk_aliases_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`),
	CONSTRAINT `fk_aliases_destination_id_destinations_id_fk` FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aliases_domain_created` ON `aliases` (`domain_id`,`created_at`);