import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

import {
  createRpaJob,
  markRpaJobFinished,
  markRpaJobRunning,
} from "@/lib/appointment-tool/live-availability-store";

export type ApotoolTaskPriority =
  | "live_hold_confirm"
  | "live_availability_read"
  | "post_call_booking"
  | "snapshot_refresh"
  | "health_check";

type QueueContext = {
  jobId: string;
  priority: ApotoolTaskPriority;
};

type PendingTask<T> = {
  jobId: string;
  taskType: ApotoolTaskPriority;
  priorityValue: number;
  label: string;
  details: Record<string, unknown>;
  queuedAt: number;
  resolve: (value: ApotoolTaskRunResult<T>) => void;
  reject: (error: unknown) => void;
  run: () => Promise<T>;
};

export type ApotoolTaskRunResult<T> = {
  value: T;
  jobId: string;
  queuedMs: number;
  executionMs: number;
  totalMs: number;
};

const priorityOrder: Record<ApotoolTaskPriority, number> = {
  live_hold_confirm: 0,
  live_availability_read: 1,
  post_call_booking: 2,
  snapshot_refresh: 3,
  health_check: 4,
};

const queueContext = new AsyncLocalStorage<QueueContext>();
const pendingTasks: PendingTask<unknown>[] = [];
let activeTask: Promise<void> | null = null;

async function drainQueue() {
  if (activeTask || pendingTasks.length === 0) {
    return;
  }

  const nextTask = pendingTasks.shift() as PendingTask<unknown>;
  activeTask = (async () => {
    const startedAt = Date.now();
    markRpaJobRunning(nextTask.jobId, new Date(startedAt));
    try {
      const value = await queueContext.run(
        {
          jobId: nextTask.jobId,
          priority: nextTask.taskType,
        },
        nextTask.run
      );
      const finishedAt = Date.now();
      const executionMs = finishedAt - startedAt;
      const queuedMs = startedAt - nextTask.queuedAt;
      markRpaJobFinished({
        jobId: nextTask.jobId,
        status: "completed",
        finishedAt: new Date(finishedAt),
        durationMs: queuedMs + executionMs,
      });
      nextTask.resolve({
        value,
        jobId: nextTask.jobId,
        queuedMs,
        executionMs,
        totalMs: queuedMs + executionMs,
      });
    } catch (error) {
      const finishedAt = Date.now();
      markRpaJobFinished({
        jobId: nextTask.jobId,
        status: "failed",
        finishedAt: new Date(finishedAt),
        durationMs: finishedAt - nextTask.queuedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      nextTask.reject(error);
    } finally {
      activeTask = null;
      void drainQueue();
    }
  })();
}

export async function runApotoolTask<T>(
  args: {
    priority: ApotoolTaskPriority;
    label: string;
    details?: Record<string, unknown>;
  },
  task: () => Promise<T>
): Promise<ApotoolTaskRunResult<T>> {
  const current = queueContext.getStore();
  if (current) {
    const startedAt = Date.now();
    const value = await task();
    const finishedAt = Date.now();
    return {
      value,
      jobId: current.jobId,
      queuedMs: 0,
      executionMs: finishedAt - startedAt,
      totalMs: finishedAt - startedAt,
    };
  }

  const jobId = crypto.randomUUID();
  const queuedAt = Date.now();
  createRpaJob({
    jobId,
    taskType: args.priority,
    priority: priorityOrder[args.priority],
    label: args.label,
    queuedAt: new Date(queuedAt),
    details: args.details,
  });

  return new Promise<ApotoolTaskRunResult<T>>((resolve, reject) => {
    pendingTasks.push({
      jobId,
      taskType: args.priority,
      priorityValue: priorityOrder[args.priority],
      label: args.label,
      details: args.details ?? {},
      queuedAt,
      resolve: resolve as (value: ApotoolTaskRunResult<unknown>) => void,
      reject,
      run: task,
    });
    pendingTasks.sort((left, right) => {
      if (left.priorityValue !== right.priorityValue) {
        return left.priorityValue - right.priorityValue;
      }
      return left.queuedAt - right.queuedAt;
    });
    void drainQueue();
  });
}

export async function runApotoolTaskValue<T>(
  args: {
    priority: ApotoolTaskPriority;
    label: string;
    details?: Record<string, unknown>;
  },
  task: () => Promise<T>
): Promise<T> {
  const result = await runApotoolTask(args, task);
  return result.value;
}

export function getApotoolTaskQueueState() {
  return {
    active: Boolean(activeTask),
    pendingCount: pendingTasks.length,
    pending: pendingTasks.map((task) => ({
      jobId: task.jobId,
      priority: task.taskType,
      label: task.label,
      queuedAt: new Date(task.queuedAt).toISOString(),
    })),
  };
}
