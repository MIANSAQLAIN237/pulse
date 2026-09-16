import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { generateRoomCode } from "@pulse/shared";
import { HttpError } from "./lib/http-error.js";
import type { SnapshotPoll } from "./lib/snapshot.js";

export const DEFAULT_DATABASE_URL = "postgresql://pulse:pulse@localhost:5434/pulse";

export type PollRow = {
  id: string;
  code: string;
  question: string;
  hide_until_reveal: number;
  locked: number;
  revealed: number;
  closed: number;
  host_token_hash: string;
  expires_at: string;
  created_at: string;
};

export type OptionCountRow = {
  id: string;
  label: string;
  position: number;
  votes: number;
};

export type PollRecord = {
  id: string;
  code: string;
  question: string;
  hideUntilReveal: boolean;
  locked: boolean;
  revealed: boolean;
  closed: boolean;
  hostTokenHash: string;
  expiresAt: string;
  createdAt: string;
  options: SnapshotPoll["options"];
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
};

let pool: Pool | undefined;

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return pool;
}

export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const pgErr = err as PgErrorLike;
  return pgErr.code === "23505";
}

function asBool(value: number): boolean {
  return value === 1;
}

function mapPoll(row: PollRow, options: SnapshotPoll["options"]): PollRecord {
  return {
    id: row.id,
    code: row.code,
    question: row.question,
    hideUntilReveal: asBool(row.hide_until_reveal),
    locked: asBool(row.locked),
    revealed: asBool(row.revealed),
    closed: asBool(row.closed),
    hostTokenHash: row.host_token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    options,
  };
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient,
): Promise<QueryResult<T>> {
  const runner = client ?? getPool();
  return runner.query<T>(text, values);
}

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      question TEXT NOT NULL,
      hide_until_reveal INT NOT NULL DEFAULT 0,
      locked INT NOT NULL DEFAULT 0,
      revealed INT NOT NULL DEFAULT 0,
      closed INT NOT NULL DEFAULT 0,
      host_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS options (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id),
      label TEXT NOT NULL,
      position INT NOT NULL
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id),
      option_id TEXT NOT NULL REFERENCES options(id),
      voter_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (poll_id, voter_id)
    )
  `);
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}

export type NewPollOption = { id: string; label: string; position: number };

export type NewPoll = {
  id: string;
  code: string;
  question: string;
  hideUntilReveal: boolean;
  hostTokenHash: string;
  expiresAt: string;
  createdAt: string;
  options: NewPollOption[];
};

export async function insertPoll(record: NewPoll): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO polls (
         id, code, question, hide_until_reveal, locked, revealed, closed,
         host_token_hash, expires_at, created_at
       ) VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6, $7)`,
      [
        record.id,
        record.code,
        record.question,
        record.hideUntilReveal ? 1 : 0,
        record.hostTokenHash,
        record.expiresAt,
        record.createdAt,
      ],
    );
    for (const option of record.options) {
      await client.query(
        `INSERT INTO options (id, poll_id, label, position) VALUES ($1, $2, $3, $4)`,
        [option.id, record.id, option.label, option.position],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function randomCodeBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

export async function createPollWithCodeRetry(input: {
  question: string;
  options: string[];
  hideUntilReveal: boolean;
  ttlHours: number;
  hostTokenHash: string;
}): Promise<{ pollId: string; code: string; expiresAt: string }> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + input.ttlHours * 60 * 60 * 1000).toISOString();
  const createdAtIso = createdAt.toISOString();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pollId = crypto.randomUUID();
    const code = generateRoomCode(randomCodeBytes);
    const optionRows: NewPollOption[] = input.options.map((label, position) => ({
      id: crypto.randomUUID(),
      label,
      position,
    }));
    try {
      await insertPoll({
        id: pollId,
        code,
        question: input.question,
        hideUntilReveal: input.hideUntilReveal,
        hostTokenHash: input.hostTokenHash,
        expiresAt,
        createdAt: createdAtIso,
        options: optionRows,
      });
      return { pollId, code, expiresAt };
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }

  throw new HttpError(500, "ROOM_CODE", "Unable to generate a unique room code");
}

async function optionCounts(pollId: string): Promise<SnapshotPoll["options"]> {
  const result = await query<OptionCountRow>(
    `SELECT o.id, o.label, o.position, COUNT(v.id)::int AS votes
     FROM options o
     LEFT JOIN votes v ON v.option_id = o.id AND v.poll_id = o.poll_id
     WHERE o.poll_id = $1
     GROUP BY o.id, o.label, o.position
     ORDER BY o.position ASC`,
    [pollId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    votes: row.votes,
    position: row.position,
  }));
}

export async function getPollByCode(code: string): Promise<PollRecord | null> {
  const result = await query<PollRow>(`SELECT * FROM polls WHERE code = $1 LIMIT 1`, [code]);
  const row = result.rows[0];
  if (!row) return null;
  const options = await optionCounts(row.id);
  return mapPoll(row, options);
}

export async function pollExistsByCode(code: string): Promise<boolean> {
  const result = await query<{ exists: number }>(
    `SELECT 1::int AS exists FROM polls WHERE code = $1 LIMIT 1`,
    [code],
  );
  return Boolean(result.rows[0]);
}

export async function getVoterOptionId(pollId: string, voterId: string): Promise<string | null> {
  const result = await query<{ option_id: string }>(
    `SELECT option_id FROM votes WHERE poll_id = $1 AND voter_id = $2 LIMIT 1`,
    [pollId, voterId],
  );
  return result.rows[0]?.option_id ?? null;
}

export async function insertVote(params: {
  id: string;
  pollId: string;
  optionId: string;
  voterId: string;
  createdAt: string;
}): Promise<"ok" | "invalid_option"> {
  const result = await query(
    `INSERT INTO votes (id, poll_id, option_id, voter_id, created_at)
     SELECT $1, $2, $3, $4, $5
     WHERE EXISTS (SELECT 1 FROM options WHERE id = $3 AND poll_id = $2)`,
    [params.id, params.pollId, params.optionId, params.voterId, params.createdAt],
  );
  if ((result.rowCount ?? 0) === 0) return "invalid_option";
  return "ok";
}

export async function updatePollFlags(
  pollId: string,
  flags: Partial<{ locked: boolean; revealed: boolean; closed: boolean }>,
): Promise<void> {
  const sets: string[] = [];
  const values: Array<number | string> = [];
  let index = 1;
  if (flags.locked !== undefined) {
    sets.push(`locked = $${index}`);
    values.push(flags.locked ? 1 : 0);
    index += 1;
  }
  if (flags.revealed !== undefined) {
    sets.push(`revealed = $${index}`);
    values.push(flags.revealed ? 1 : 0);
    index += 1;
  }
  if (flags.closed !== undefined) {
    sets.push(`closed = $${index}`);
    values.push(flags.closed ? 1 : 0);
    index += 1;
  }
  if (sets.length === 0) return;
  values.push(pollId);
  await query(`UPDATE polls SET ${sets.join(", ")} WHERE id = $${index}`, values);
}

export function toSnapshotPoll(record: PollRecord): SnapshotPoll {
  return {
    code: record.code,
    question: record.question,
    hideUntilReveal: record.hideUntilReveal,
    locked: record.locked,
    revealed: record.revealed,
    closed: record.closed,
    expiresAt: record.expiresAt,
    options: record.options,
  };
}
