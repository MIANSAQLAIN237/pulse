import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { deriveStatus, type JoinPayload, type PollState, type PresencePayload, type SocketErrorPayload, type VotePayload } from "@pulse/shared";
import {
  getPollByCode,
  getVoterOptionId,
  insertVote,
  isUniqueViolation,
  toSnapshotPoll,
  updatePollFlags,
  type PollRecord,
} from "./db.js";
import { allowVote } from "./lib/rate-limit.js";
import { buildSnapshot } from "./lib/snapshot.js";
import { readExistingVoterId, verifyHostToken } from "./lib/tokens.js";

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  leave: () => void;
  vote: (payload: VotePayload) => void;
  lock: () => void;
  unlock: () => void;
  reveal: () => void;
  close: () => void;
}

interface ServerToClientEvents {
  state: (state: PollState) => void;
  presence: (payload: PresencePayload) => void;
  error: (payload: SocketErrorPayload) => void;
}

interface SocketData {
  code?: string;
  pollId?: string;
  voterId: string;
  isHost: boolean;
}

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type PollSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const presenceByCode = new Map<string, Set<string>>();

const joinSchema = z.object({
  code: z.string().trim().min(1).max(16),
  hostToken: z.string().min(1).optional(),
});

const voteSchema = z.object({
  optionId: z.string().min(1),
});

export function getPresence(code: string): number {
  return presenceByCode.get(code)?.size ?? 0;
}

function addPresence(code: string, socketId: string): void {
  let sockets = presenceByCode.get(code);
  if (!sockets) {
    sockets = new Set();
    presenceByCode.set(code, sockets);
  }
  sockets.add(socketId);
}

function removePresence(code: string, socketId: string): void {
  const sockets = presenceByCode.get(code);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) presenceByCode.delete(code);
}

function emitError(socket: PollSocket, code: string, message: string): void {
  socket.emit("error", { code, message });
}

function emitPresence(io: IoServer, code: string): void {
  io.to(code).emit("presence", { count: getPresence(code) });
}

async function snapshotForSocket(poll: PollRecord, socket: PollSocket): Promise<PollState> {
  const youVotedOptionId = await getVoterOptionId(poll.id, socket.data.voterId);
  return buildSnapshot(toSnapshotPoll(poll), {
    youVotedOptionId,
    isHost: socket.data.isHost === true,
    presence: getPresence(poll.code),
  });
}

async function broadcastState(io: IoServer, code: string): Promise<void> {
  const poll = await getPollByCode(code);
  if (!poll) return;
  const sockets = await io.in(code).fetchSockets();
  for (const remote of sockets) {
    const youVotedOptionId = await getVoterOptionId(poll.id, remote.data.voterId);
    const state = buildSnapshot(toSnapshotPoll(poll), {
      youVotedOptionId,
      isHost: remote.data.isHost === true,
      presence: getPresence(code),
    });
    remote.emit("state", state);
  }
}

function rejectIfNotOpen(poll: PollRecord, socket: PollSocket): boolean {
  const status = deriveStatus({
    closed: poll.closed,
    locked: poll.locked,
    expiresAt: poll.expiresAt,
  });
  if (status === "expired") {
    emitError(socket, "POLL_EXPIRED", "This poll has expired");
    return true;
  }
  if (status === "closed") {
    emitError(socket, "POLL_CLOSED", "This poll is closed");
    return true;
  }
  if (status === "locked") {
    emitError(socket, "POLL_LOCKED", "Voting is locked");
    return true;
  }
  return false;
}

function requireHost(socket: PollSocket): boolean {
  if (socket.data.isHost) return true;
  emitError(socket, "FORBIDDEN", "Host only");
  return false;
}

function requireJoined(socket: PollSocket): string | null {
  const code = socket.data.code;
  if (!code) {
    emitError(socket, "NOT_JOINED", "Join a poll first");
    return null;
  }
  return code;
}

function leaveRoom(io: IoServer, socket: PollSocket): void {
  const previous = socket.data.code;
  if (!previous) return;
  socket.leave(previous);
  removePresence(previous, socket.id);
  emitPresence(io, previous);
  socket.data.code = undefined;
  socket.data.pollId = undefined;
  socket.data.isHost = false;
}

async function handleJoin(io: IoServer, socket: PollSocket, payload: JoinPayload): Promise<void> {
  const parsed = joinSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid join payload");
    return;
  }

  const code = parsed.data.code.toUpperCase();
  const poll = await getPollByCode(code);
  if (!poll) {
    emitError(socket, "NOT_FOUND", "Poll not found");
    return;
  }

  if (socket.data.code && socket.data.code !== code) {
    leaveRoom(io, socket);
  }

  let isHost = false;
  if (parsed.data.hostToken) {
    if (verifyHostToken(parsed.data.hostToken, poll.hostTokenHash)) {
      isHost = true;
    } else {
      emitError(socket, "INVALID_HOST_TOKEN", "Invalid host token");
    }
  }

  socket.data.code = code;
  socket.data.pollId = poll.id;
  socket.data.isHost = isHost;
  await socket.join(code);
  addPresence(code, socket.id);

  socket.emit("state", await snapshotForSocket(poll, socket));
  emitPresence(io, code);
}

async function handleVote(io: IoServer, socket: PollSocket, payload: VotePayload): Promise<void> {
  const code = requireJoined(socket);
  if (!code) return;

  if (!allowVote(socket.data.voterId)) {
    emitError(socket, "RATE_LIMITED", "Too many votes from this client");
    return;
  }

  const parsed = voteSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid vote payload");
    return;
  }

  const poll = await getPollByCode(code);
  if (!poll) {
    emitError(socket, "NOT_FOUND", "Poll not found");
    return;
  }
  if (rejectIfNotOpen(poll, socket)) return;

  try {
    const result = await insertVote({
      id: crypto.randomUUID(),
      pollId: poll.id,
      optionId: parsed.data.optionId,
      voterId: socket.data.voterId,
      createdAt: new Date().toISOString(),
    });
    if (result === "invalid_option") {
      emitError(socket, "INVALID_OPTION", "Unknown option");
      return;
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      emitError(socket, "ALREADY_VOTED", "You have already voted");
      return;
    }
    emitError(socket, "INTERNAL", "Could not record vote");
    return;
  }

  await broadcastState(io, code);
}

async function handleHostFlag(
  io: IoServer,
  socket: PollSocket,
  flags: Partial<{ locked: boolean; revealed: boolean; closed: boolean }>,
): Promise<void> {
  const code = requireJoined(socket);
  if (!code) return;
  if (!requireHost(socket)) return;
  const poll = await getPollByCode(code);
  if (!poll) {
    emitError(socket, "NOT_FOUND", "Poll not found");
    return;
  }
  await updatePollFlags(poll.id, flags);
  await broadcastState(io, code);
}

export function attachSocket(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: CLIENT_ORIGIN,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const voterId = await readExistingVoterId(socket.handshake.headers.cookie);
      if (!voterId) {
        next(new Error("NO_VOTER"));
        return;
      }
      socket.data.voterId = voterId;
      socket.data.isHost = false;
      next();
    } catch {
      next(new Error("NO_VOTER"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join", (payload) => {
      void handleJoin(io, socket, payload);
    });
    socket.on("leave", () => {
      leaveRoom(io, socket);
    });
    socket.on("vote", (payload) => {
      void handleVote(io, socket, payload);
    });
    socket.on("lock", () => {
      void handleHostFlag(io, socket, { locked: true });
    });
    socket.on("unlock", () => {
      void handleHostFlag(io, socket, { locked: false });
    });
    socket.on("reveal", () => {
      void handleHostFlag(io, socket, { revealed: true });
    });
    socket.on("close", () => {
      void handleHostFlag(io, socket, { closed: true });
    });
    socket.on("disconnect", () => {
      leaveRoom(io, socket);
    });
  });

  return io;
}
