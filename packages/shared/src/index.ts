export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type PollStatus = "open" | "locked" | "closed" | "expired";

export type PollOptionState = {
  id: string;
  label: string;
  votes: number;
  position: number;
};

export type PollState = {
  code: string;
  question: string;
  status: PollStatus;
  hideUntilReveal: boolean;
  revealed: boolean;
  locked: boolean;
  closed: boolean;
  expiresAt: string;
  options: PollOptionState[];
  totalVotes: number;
  youVotedOptionId: string | null;
  isHost: boolean;
  presence: number;
  resultsVisible: boolean;
};

export type CreatePollInput = {
  question: string;
  options: string[];
  hideUntilReveal?: boolean;
  ttlHours?: number;
};

export type CreatePollResponse = {
  pollId: string;
  code: string;
  hostToken: string;
  joinUrl: string;
  expiresAt: string;
};

export type ApiErrorBody = {
  error: { code: string; message: string };
};

export type JoinPayload = { code: string; hostToken?: string };
export type VotePayload = { optionId: string };
export type PresencePayload = { count: number };
export type SocketErrorPayload = { code: string; message: string };

export function deriveStatus(poll: {
  closed: boolean;
  locked: boolean;
  expiresAt: string | Date;
}): PollStatus {
  const expires = new Date(poll.expiresAt).getTime();
  if (Number.isFinite(expires) && Date.now() >= expires) return "expired";
  if (poll.closed) return "closed";
  if (poll.locked) return "locked";
  return "open";
}

export function resultsVisibleFor(poll: {
  hideUntilReveal: boolean;
  revealed: boolean;
  isHost: boolean;
}): boolean {
  if (poll.isHost) return true;
  if (!poll.hideUntilReveal) return true;
  return poll.revealed;
}

export function generateRoomCode(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(4);
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    const b = bytes[i] ?? 0;
    code += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  }
  return code;
}

export function sanitizeOptions(options: string[]): string[] {
  const cleaned = options.map((item) => item.trim()).filter(Boolean);
  const unique: string[] = [];
  for (const item of cleaned) {
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) unique.push(item);
  }
  return unique.slice(0, 8);
}
