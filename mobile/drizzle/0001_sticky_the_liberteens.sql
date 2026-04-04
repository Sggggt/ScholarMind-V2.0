CREATE TABLE `human_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`reviewerId` int,
	`approved` boolean NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `human_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_tasks` (
	`id` varchar(64) NOT NULL,
	`userId` int,
	`title` varchar(500) NOT NULL,
	`topic` text NOT NULL,
	`description` text,
	`status` enum('pending','running','paused','review','completed','failed','aborted') NOT NULL DEFAULT 'pending',
	`modules` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`overallScore` int NOT NULL,
	`decision` enum('accept','weak_accept','weak_reject','reject') NOT NULL,
	`dimensions` json NOT NULL,
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `review_results_taskId_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
CREATE TABLE `task_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`moduleId` varchar(16) NOT NULL,
	`level` enum('info','warn','error') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_logs_id` PRIMARY KEY(`id`)
);
