import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── ScholarMind Tables ───────────────────────────────────────────────────────

/**
 * Research tasks table
 */
export const researchTasks = mysqlTable("research_tasks", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId"),
  title: varchar("title", { length: 500 }).notNull(),
  topic: text("topic").notNull(),
  description: text("description"),
  status: mysqlEnum("status", [
    "pending",
    "running",
    "paused",
    "review",
    "completed",
    "failed",
    "aborted",
  ])
    .default("pending")
    .notNull(),
  // JSON array of ModuleState objects
  modules: json("modules").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResearchTask = typeof researchTasks.$inferSelect;
export type InsertResearchTask = typeof researchTasks.$inferInsert;

/**
 * Task execution logs
 */
export const taskLogs = mysqlTable("task_logs", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("taskId", { length: 64 }).notNull(),
  moduleId: varchar("moduleId", { length: 16 }).notNull(),
  level: mysqlEnum("level", ["info", "warn", "error"]).default("info").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskLog = typeof taskLogs.$inferSelect;
export type InsertTaskLog = typeof taskLogs.$inferInsert;

/**
 * AI review results (M9 output)
 */
export const reviewResults = mysqlTable("review_results", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("taskId", { length: 64 }).notNull().unique(),
  overallScore: int("overallScore").notNull(),
  decision: mysqlEnum("decision", [
    "accept",
    "weak_accept",
    "weak_reject",
    "reject",
  ]).notNull(),
  dimensions: json("dimensions").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReviewResult = typeof reviewResults.$inferSelect;
export type InsertReviewResult = typeof reviewResults.$inferInsert;

/**
 * Human review decisions
 */
export const humanReviews = mysqlTable("human_reviews", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("taskId", { length: 64 }).notNull(),
  reviewerId: int("reviewerId"),
  approved: boolean("approved").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HumanReview = typeof humanReviews.$inferSelect;
export type InsertHumanReview = typeof humanReviews.$inferInsert;
