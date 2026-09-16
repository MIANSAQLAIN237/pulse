import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sanitizeOptions, type CreatePollResponse } from "@pulse/shared";
import { createPollWithCodeRetry, getPollByCode, getVoterOptionId, toSnapshotPoll } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { allowCreate } from "../lib/rate-limit.js";
import { buildSnapshot } from "../lib/snapshot.js";
import { hashHostToken, randomHostToken, verifyHostToken } from "../lib/tokens.js";
import { getPresence } from "../socket.js";

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const createPollSchema = z.object({
  question: z.string().trim().min(5).max(200),
  options: z.array(z.string().trim().min(1)).min(2).max(8),
  hideUntilReveal: z.boolean().optional().default(false),
  ttlHours: z.number().int().min(1).max(72).optional().default(24),
});

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export const pollsRouter = Router();

pollsRouter.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

pollsRouter.post("/api/polls", async (req: Request, res: Response) => {
  if (!allowCreate(clientIp(req))) {
    throw new HttpError(429, "RATE_LIMITED", "Too many polls created from this address");
  }

  const parsed = createPollSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const options = sanitizeOptions(parsed.data.options);
  if (options.length < 2) {
    throw new HttpError(400, "VALIDATION_ERROR", "Provide at least 2 non-empty unique options");
  }

  const hostToken = randomHostToken();
  const created = await createPollWithCodeRetry({
    question: parsed.data.question,
    options,
    hideUntilReveal: parsed.data.hideUntilReveal,
    ttlHours: parsed.data.ttlHours,
    hostTokenHash: hashHostToken(hostToken),
  });

  const body: CreatePollResponse = {
    pollId: created.pollId,
    code: created.code,
    hostToken,
    joinUrl: `${CLIENT_ORIGIN}/p/${created.code}`,
    expiresAt: created.expiresAt,
  };
  res.status(201).json(body);
});

pollsRouter.get("/api/polls/:code", async (req: Request, res: Response) => {
  const rawParam = req.params.code;
  const raw = Array.isArray(rawParam) ? (rawParam[0] ?? "") : (rawParam ?? "");
  const code = raw.trim().toUpperCase();
  const poll = await getPollByCode(code);
  if (!poll) {
    throw new HttpError(404, "NOT_FOUND", "Poll not found");
  }

  const token = bearerToken(req);
  const isHost = Boolean(token && verifyHostToken(token, poll.hostTokenHash));
  const youVotedOptionId = await getVoterOptionId(poll.id, req.voterId);
  const state = buildSnapshot(toSnapshotPoll(poll), {
    youVotedOptionId,
    isHost,
    presence: getPresence(code),
  });
  res.json(state);
});
