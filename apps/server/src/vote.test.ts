import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getPool, initDb, isUniqueViolation } from "./db.js";
import { buildSnapshot } from "./lib/snapshot.js";

describe("vote uniqueness", () => {
  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("second insert for the same (poll_id, voter_id) throws unique_violation 23505", async () => {
    const pool = getPool();
    const pollId = crypto.randomUUID();
    const optionId = crypto.randomUUID();
    const voterId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO polls (
         id, code, question, hide_until_reveal, locked, revealed, closed,
         host_token_hash, expires_at, created_at
       ) VALUES ($1, $2, $3, 0, 0, 0, 0, $4, $5, $6)`,
      [pollId, pollId, "Uniqueness test poll?", "hash", expiresAt, now],
    );
    await pool.query(
      `INSERT INTO options (id, poll_id, label, position) VALUES ($1, $2, $3, $4)`,
      [optionId, pollId, "Option A", 0],
    );
    await pool.query(
      `INSERT INTO votes (id, poll_id, option_id, voter_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), pollId, optionId, voterId, now],
    );

    let thrown: unknown;
    try {
      await pool.query(
        `INSERT INTO votes (id, poll_id, option_id, voter_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), pollId, optionId, voterId, now],
      );
    } catch (err) {
      thrown = err;
    } finally {
      await pool.query(`DELETE FROM votes WHERE poll_id = $1`, [pollId]);
      await pool.query(`DELETE FROM options WHERE poll_id = $1`, [pollId]);
      await pool.query(`DELETE FROM polls WHERE id = $1`, [pollId]);
    }

    expect(isUniqueViolation(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "23505" });
  });
});

describe("snapshot hides votes", () => {
  it("zeros option.votes and totalVotes when hideUntilReveal and not revealed and not host", () => {
    const options = [{ id: "opt-a", label: "A", votes: 7, position: 0 }];
    const state = buildSnapshot(
      {
        code: "K7MQ",
        question: "Which topic should we cover next?",
        hideUntilReveal: true,
        locked: false,
        revealed: false,
        closed: false,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        options,
      },
      { youVotedOptionId: "opt-a", isHost: false, presence: 3 },
    );

    expect(state.resultsVisible).toBe(false);
    expect(state.options[0]?.votes).toBe(0);
    expect(state.totalVotes).toBe(0);
    expect(options[0]?.votes).toBe(7);
  });
});
