import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AppointmentAvailabilityCandidate, ServiceLine } from "@/lib/types";

type SnapshotRecord = {
  cacheKey: string;
  serviceLine: ServiceLine;
  date: string;
  source: string;
  fetchedAt: string;
  staleAfterMs: number;
  expiresAt: string;
  candidates: AppointmentAvailabilityCandidate[];
};

type HoldLeaseRecord = {
  leaseId: string;
  conversationId: string;
  serviceLine: ServiceLine;
  candidateDate: string;
  candidateTcStartTime: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  details: Record<string, unknown>;
};

type JobRecord = {
  jobId: string;
  taskType: string;
  priority: number;
  label: string;
  status: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  details: Record<string, unknown>;
  error: string | null;
};

let database: DatabaseSync | null = null;

function getDatabasePath() {
  return path.resolve(process.cwd(), "output", "appointment-state.sqlite");
}

function ensureDatabase() {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS availability_snapshots (
      cache_key TEXT PRIMARY KEY,
      service_line TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      stale_after_ms INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      candidates_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hold_leases (
      lease_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      service_line TEXT NOT NULL,
      candidate_date TEXT NOT NULL,
      candidate_tc_start_time TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rpa_jobs (
      job_id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      priority INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      details_json TEXT NOT NULL,
      error TEXT
    );
  `);
  return database;
}

function toIsoDate(value: Date) {
  return value.toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function buildAvailabilitySnapshotKey(args: {
  serviceLine: ServiceLine;
  date: string;
}) {
  return `${args.serviceLine}:${args.date}`;
}

export function readAvailabilitySnapshot(args: {
  serviceLine: ServiceLine;
  date: string;
}): SnapshotRecord | null {
  const db = ensureDatabase();
  const cacheKey = buildAvailabilitySnapshotKey(args);
  const row = db
    .prepare(
      `
        SELECT cache_key, service_line, date, source, fetched_at, stale_after_ms, expires_at, candidates_json
        FROM availability_snapshots
        WHERE cache_key = ?
      `
    )
    .get(cacheKey) as
    | {
        cache_key: string;
        service_line: ServiceLine;
        date: string;
        source: string;
        fetched_at: string;
        stale_after_ms: number;
        expires_at: string;
        candidates_json: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    cacheKey: row.cache_key,
    serviceLine: row.service_line,
    date: row.date,
    source: row.source,
    fetchedAt: row.fetched_at,
    staleAfterMs: Number(row.stale_after_ms),
    expiresAt: row.expires_at,
    candidates: parseJson(row.candidates_json, []),
  };
}

export function writeAvailabilitySnapshot(args: {
  serviceLine: ServiceLine;
  date: string;
  source: string;
  staleAfterMs: number;
  expiresAt: Date;
  candidates: AppointmentAvailabilityCandidate[];
  fetchedAt?: Date;
}) {
  const db = ensureDatabase();
  const fetchedAt = args.fetchedAt ?? new Date();
  const cacheKey = buildAvailabilitySnapshotKey(args);
  db.prepare(
    `
      INSERT INTO availability_snapshots (
        cache_key,
        service_line,
        date,
        source,
        fetched_at,
        stale_after_ms,
        expires_at,
        candidates_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        source = excluded.source,
        fetched_at = excluded.fetched_at,
        stale_after_ms = excluded.stale_after_ms,
        expires_at = excluded.expires_at,
        candidates_json = excluded.candidates_json
    `
  ).run(
    cacheKey,
    args.serviceLine,
    args.date,
    args.source,
    toIsoDate(fetchedAt),
    args.staleAfterMs,
    toIsoDate(args.expiresAt),
    JSON.stringify(args.candidates)
  );
}

export function createHoldLease(args: {
  leaseId: string;
  conversationId: string;
  serviceLine: ServiceLine;
  candidateDate: string;
  candidateTcStartTime: string;
  expiresAt: Date;
  details?: Record<string, unknown>;
}) {
  const db = ensureDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO hold_leases (
        lease_id,
        conversation_id,
        service_line,
        candidate_date,
        candidate_tc_start_time,
        status,
        created_at,
        updated_at,
        expires_at,
        details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    args.leaseId,
    args.conversationId,
    args.serviceLine,
    args.candidateDate,
    args.candidateTcStartTime,
    "pending",
    now,
    now,
    toIsoDate(args.expiresAt),
    JSON.stringify(args.details ?? {})
  );
}

export function updateHoldLease(args: {
  leaseId: string;
  status: string;
  details?: Record<string, unknown>;
}) {
  const db = ensureDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE hold_leases
      SET status = ?, updated_at = ?, details_json = ?
      WHERE lease_id = ?
    `
  ).run(args.status, now, JSON.stringify(args.details ?? {}), args.leaseId);
}

export function readHoldLease(leaseId: string): HoldLeaseRecord | null {
  const db = ensureDatabase();
  const row = db
    .prepare(
      `
        SELECT
          lease_id,
          conversation_id,
          service_line,
          candidate_date,
          candidate_tc_start_time,
          status,
          created_at,
          updated_at,
          expires_at,
          details_json
        FROM hold_leases
        WHERE lease_id = ?
      `
    )
    .get(leaseId) as
    | {
        lease_id: string;
        conversation_id: string;
        service_line: ServiceLine;
        candidate_date: string;
        candidate_tc_start_time: string;
        status: string;
        created_at: string;
        updated_at: string;
        expires_at: string;
        details_json: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    leaseId: row.lease_id,
    conversationId: row.conversation_id,
    serviceLine: row.service_line,
    candidateDate: row.candidate_date,
    candidateTcStartTime: row.candidate_tc_start_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    details: parseJson(row.details_json, {}),
  };
}

export function createRpaJob(args: {
  jobId: string;
  taskType: string;
  priority: number;
  label: string;
  queuedAt: Date;
  details?: Record<string, unknown>;
}) {
  const db = ensureDatabase();
  db.prepare(
    `
      INSERT INTO rpa_jobs (
        job_id,
        task_type,
        priority,
        label,
        status,
        queued_at,
        started_at,
        finished_at,
        duration_ms,
        details_json,
        error
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)
    `
  ).run(
    args.jobId,
    args.taskType,
    args.priority,
    args.label,
    "queued",
    toIsoDate(args.queuedAt),
    JSON.stringify(args.details ?? {})
  );
}

export function markRpaJobRunning(jobId: string, startedAt: Date) {
  const db = ensureDatabase();
  db.prepare(
    `
      UPDATE rpa_jobs
      SET status = ?, started_at = ?
      WHERE job_id = ?
    `
  ).run("running", toIsoDate(startedAt), jobId);
}

export function markRpaJobFinished(args: {
  jobId: string;
  status: "completed" | "failed";
  finishedAt: Date;
  durationMs: number;
  error?: string | null;
}) {
  const db = ensureDatabase();
  db.prepare(
    `
      UPDATE rpa_jobs
      SET status = ?, finished_at = ?, duration_ms = ?, error = ?
      WHERE job_id = ?
    `
  ).run(args.status, toIsoDate(args.finishedAt), args.durationMs, args.error ?? null, args.jobId);
}

export function listRecentRpaJobs(limit = 20): JobRecord[] {
  const db = ensureDatabase();
  const rows = db
    .prepare(
      `
        SELECT
          job_id,
          task_type,
          priority,
          label,
          status,
          queued_at,
          started_at,
          finished_at,
          duration_ms,
          details_json,
          error
        FROM rpa_jobs
        ORDER BY queued_at DESC
        LIMIT ?
      `
    )
    .all(limit) as Array<{
    job_id: string;
    task_type: string;
    priority: number;
    label: string;
    status: string;
    queued_at: string;
    started_at: string | null;
    finished_at: string | null;
    duration_ms: number | null;
    details_json: string;
    error: string | null;
  }>;

  return rows.map((row) => ({
    jobId: row.job_id,
    taskType: row.task_type,
    priority: row.priority,
    label: row.label,
    status: row.status,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    details: parseJson(row.details_json, {}),
    error: row.error,
  }));
}
