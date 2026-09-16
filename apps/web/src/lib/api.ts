import type { ApiErrorBody, CreatePollInput, CreatePollResponse, PollState } from "@pulse/shared";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (data && typeof data === "object" && "error" in data) {
    const body = data as ApiErrorBody;
    const message = body.error?.message;
    if (message) throw new Error(message);
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }

  return data as T;
}

export async function ensureVoterSession(): Promise<void> {
  const res = await fetch("/api/health", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error("Could not start a voting session");
  }
}

export function createPoll(input: CreatePollInput): Promise<CreatePollResponse> {
  return request<CreatePollResponse>("/polls", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPoll(code: string, hostToken?: string | null): Promise<PollState> {
  return request<PollState>(`/polls/${encodeURIComponent(code)}`, {
    headers: hostToken ? { Authorization: `Bearer ${hostToken}` } : {},
  });
}
