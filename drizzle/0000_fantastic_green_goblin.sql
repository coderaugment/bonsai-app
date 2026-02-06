CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` text NOT NULL,
	`author_type` text NOT NULL,
	`author_id` integer,
	`persona_id` text,
	`content` text NOT NULL,
	`attachments` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`color` text NOT NULL,
	`avatar` text,
	`role_id` integer,
	`role` text DEFAULT 'developer',
	`personality` text,
	`skills` text,
	`processes` text,
	`goals` text,
	`permissions` text,
	`project_id` integer,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`description` text,
	`github_owner` text,
	`github_repo` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `role_skills` (
	`role_id` integer NOT NULL,
	`skill_id` integer NOT NULL,
	PRIMARY KEY(`role_id`, `skill_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`icon` text,
	`workflow` text,
	`system_prompt` text,
	`tools` text,
	`folder_access` text,
	`skill_definitions` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_slug_unique` ON `roles` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);--> statement-breakpoint
CREATE TABLE `ticket_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`state` text DEFAULT 'backlog' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
	`created_by` integer,
	`comment_count` integer DEFAULT 0,
	`acceptance_criteria` text,
	`has_attachments` integer DEFAULT false,
	`last_agent_activity` text,
	`last_human_comment_at` text,
	`returned_from_verification` integer DEFAULT false,
	`project_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`worktree_path` text,
	`research_completed_at` text,
	`research_completed_by` text,
	`research_approved_at` text,
	`research_approved_by` integer,
	`plan_completed_at` text,
	`plan_completed_by` text,
	`plan_approved_at` text,
	`plan_approved_by` integer,
	FOREIGN KEY (`assignee_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`research_completed_by`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`research_approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_completed_by`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
