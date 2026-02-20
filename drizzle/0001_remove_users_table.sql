DROP TABLE `users`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`state` text DEFAULT 'planning' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
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
	`plan_completed_at` text,
	`plan_completed_by` text,
	`plan_approved_at` text,
	`merged_at` text,
	`merge_commit` text,
	`is_epic` integer DEFAULT false,
	`epic_id` integer,
	`deleted_at` text,
	FOREIGN KEY (`assignee_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`research_completed_by`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_completed_by`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tickets`("id", "title", "description", "type", "state", "priority", "assignee_id", "comment_count", "acceptance_criteria", "has_attachments", "last_agent_activity", "last_human_comment_at", "returned_from_verification", "project_id", "created_at", "worktree_path", "research_completed_at", "research_completed_by", "research_approved_at", "plan_completed_at", "plan_completed_by", "plan_approved_at", "merged_at", "merge_commit", "is_epic", "epic_id", "deleted_at") SELECT "id", "title", "description", "type", "state", "priority", "assignee_id", "comment_count", "acceptance_criteria", "has_attachments", "last_agent_activity", "last_human_comment_at", "returned_from_verification", "project_id", "created_at", "worktree_path", "research_completed_at", "research_completed_by", "research_approved_at", "plan_completed_at", "plan_completed_by", "plan_approved_at", "merged_at", "merge_commit", "is_epic", "epic_id", "deleted_at" FROM `tickets`;--> statement-breakpoint
DROP TABLE `tickets`;--> statement-breakpoint
ALTER TABLE `__new_tickets` RENAME TO `tickets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;