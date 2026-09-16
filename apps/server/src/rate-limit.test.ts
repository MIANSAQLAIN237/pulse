import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit then rejects", () => {
    const key = "vote:socket-a";
    for (let i = 0; i < 8; i += 1) {
      expect(rateLimit(key, 8, 10_000)).toBe(true);
    }
    expect(rateLimit(key, 8, 10_000)).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("create:1.1.1.1", 10, 3_600_000)).toBe(true);
    expect(rateLimit("create:2.2.2.2", 10, 3_600_000)).toBe(true);
  });

  it("allows create 10 times per IP per hour then blocks", () => {
    const key = "create:203.0.113.10";
    for (let i = 0; i < 10; i += 1) {
      expect(rateLimit(key, 10, 3_600_000)).toBe(true);
    }
    expect(rateLimit(key, 10, 3_600_000)).toBe(false);
  });

  it("resets after the window elapses", () => {
    const key = "create:window";
    for (let i = 0; i < 10; i += 1) {
      expect(rateLimit(key, 10, 3_600_000)).toBe(true);
    }
    expect(rateLimit(key, 10, 3_600_000)).toBe(false);
    vi.advanceTimersByTime(3_600_000);
    expect(rateLimit(key, 10, 3_600_000)).toBe(true);
  });
});
