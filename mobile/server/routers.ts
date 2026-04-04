import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { randomUUID } from "crypto";

// ─── Shared Schemas ───────────────────────────────────────────────────────────

const moduleStateSchema = z.object({
  module_id: z.string(),
  status: z.enum(["waiting", "running", "completed", "failed", "skipped"]),
  percent: z.number().min(0).max(100),
  message: z.string(),
});

const reviewDimensionSchema = z.object({
  name: z.string(),
  score: z.number(),
  maxScore: z.number(),
  comment: z.string(),
});

// ─── Task Router ──────────────────────────────────────────────────────────────

const tasksRouter = router({
  // List all tasks (public for mobile app without auth)
  list: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    const tasks = await db.getAllTasks(userId);
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      topic: t.topic,
      description: t.description,
      status: t.status,
      modules: t.modules as any[],
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
    }));
  }),

  // Get single task
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new Error("Task not found");
      return {
        id: task.id,
        title: task.title,
        topic: task.topic,
        description: task.description,
        status: task.status,
        modules: task.modules as any[],
        created_at: task.createdAt.toISOString(),
        updated_at: task.updatedAt.toISOString(),
      };
    }),

  // Create task
  create: publicProcedure
    .input(
      z.object({
        topic: z.string().min(1).max(2000),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();
      const title = input.topic.slice(0, 60);
      const defaultModules = [
        "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9",
      ].map((m) => ({
        module_id: m,
        status: "waiting",
        percent: 0,
        message: "等待开始",
      }));

      const data = {
        id,
        userId: ctx.user?.id ?? null,
        title,
        topic: input.topic,
        description: input.description ?? null,
        status: "pending" as const,
        modules: defaultModules,
      };

      await db.createTask(data);
      return {
        id,
        title,
        topic: input.topic,
        description: input.description,
        status: "pending" as const,
        modules: defaultModules,
        created_at: new Date().toISOString(),
      };
    }),

  // Update task status/modules (for backend agent to call)
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["pending", "running", "paused", "review", "completed", "failed", "aborted"]).optional(),
        modules: z.array(moduleStateSchema).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updateData: any = {};
      if (input.status) updateData.status = input.status;
      if (input.modules) updateData.modules = input.modules;
      await db.updateTask(input.id, updateData);
      return { success: true };
    }),

  // Pause task
  pause: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateTask(input.id, { status: "paused" });
      return { success: true };
    }),

  // Resume task
  resume: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateTask(input.id, { status: "running" });
      return { success: true };
    }),

  // Abort task
  abort: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateTask(input.id, { status: "aborted" });
      return { success: true };
    }),

  // Delete task
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.deleteTask(input.id);
      return { success: true };
    }),

  // Get task logs
  logs: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const logs = await db.getTaskLogs(input.taskId);
      return logs.map((l) => ({
        id: l.id.toString(),
        task_id: l.taskId,
        module_id: l.moduleId,
        level: l.level,
        message: l.message,
        timestamp: l.createdAt.toISOString(),
      }));
    }),

  // Add log entry (for backend agent to call)
  addLog: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        moduleId: z.string(),
        level: z.enum(["info", "warn", "error"]),
        message: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await db.addTaskLog({
        taskId: input.taskId,
        moduleId: input.moduleId,
        level: input.level,
        message: input.message,
      });
      return { success: true };
    }),

  // Get review result
  reviewResult: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const review = await db.getReviewResult(input.taskId);
      if (!review) return null;
      return {
        task_id: review.taskId,
        overall_score: review.overallScore / 10,
        decision: review.decision,
        dimensions: review.dimensions as any[],
        summary: review.summary,
        timestamp: review.createdAt.toISOString(),
      };
    }),

  // Submit review result (for M9 agent to call)
  submitReview: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        overallScore: z.number().min(0).max(100),
        decision: z.enum(["accept", "weak_accept", "weak_reject", "reject"]),
        dimensions: z.array(reviewDimensionSchema),
        summary: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await db.upsertReviewResult({
        taskId: input.taskId,
        overallScore: input.overallScore,
        decision: input.decision,
        dimensions: input.dimensions,
        summary: input.summary,
      });
      return { success: true };
    }),

  // Submit human review decision
  humanReview: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        approved: z.boolean(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.addHumanReview({
        taskId: input.taskId,
        reviewerId: ctx.user?.id ?? null,
        approved: input.approved,
        comment: input.comment ?? null,
      });
      // Update task status based on decision
      const newStatus = input.approved ? "running" : "failed";
      await db.updateTask(input.taskId, { status: newStatus });
      return { success: true };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  tasks: tasksRouter,
});

export type AppRouter = typeof appRouter;
