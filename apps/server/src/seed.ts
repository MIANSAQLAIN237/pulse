import { insertPoll, pollExistsByCode } from "./db.js";
import { hashHostToken } from "./lib/tokens.js";

export const DEMO_CODE = "K7MQ";
export const DEMO_HOST_TOKEN = "pulse-demo-host-token";

const DEMO_QUESTION = "Which topic should we cover next?";
const DEMO_OPTIONS = [
  "Real-time systems",
  "LLM evaluation",
  "RAG quality",
  "Auth deep-dive",
];

export async function seed(): Promise<void> {
  if (await pollExistsByCode(DEMO_CODE)) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await insertPoll({
    id: crypto.randomUUID(),
    code: DEMO_CODE,
    question: DEMO_QUESTION,
    hideUntilReveal: false,
    hostTokenHash: hashHostToken(DEMO_HOST_TOKEN),
    expiresAt,
    createdAt: now.toISOString(),
    options: DEMO_OPTIONS.map((label, position) => ({
      id: crypto.randomUUID(),
      label,
      position,
    })),
  });
}
