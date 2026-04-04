import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  researchTasks,
  taskLogs,
  reviewResults,
  humanReviews,
  type InsertResearchTask,
  type InsertTaskLog,
  type InsertReviewResult,
  type InsertHumanReview,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Research Tasks ───────────────────────────────────────────────────────────

export async function getAllTasks(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (userId) {
    return db.select().from(researchTasks).where(eq(researchTasks.userId, userId)).orderBy(desc(researchTasks.createdAt));
  }
  return db.select().from(researchTasks).orderBy(desc(researchTasks.createdAt));
}

export async function getTaskById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(researchTasks).where(eq(researchTasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createTask(data: InsertResearchTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(researchTasks).values(data);
  return data;
}

export async function updateTask(id: string, data: Partial<InsertResearchTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(researchTasks).set(data).where(eq(researchTasks.id, id));
}

export async function deleteTask(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(researchTasks).where(eq(researchTasks.id, id));
}

// ─── Task Logs ────────────────────────────────────────────────────────────────

export async function getTaskLogs(taskId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(taskLogs).where(eq(taskLogs.taskId, taskId)).orderBy(taskLogs.createdAt);
}

export async function addTaskLog(data: InsertTaskLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(taskLogs).values(data);
}

// ─── Review Results ───────────────────────────────────────────────────────────

export async function getReviewResult(taskId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(reviewResults).where(eq(reviewResults.taskId, taskId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertReviewResult(data: InsertReviewResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reviewResults).values(data).onDuplicateKeyUpdate({ set: data });
}

// ─── Human Reviews ────────────────────────────────────────────────────────────

export async function addHumanReview(data: InsertHumanReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(humanReviews).values(data);
}
