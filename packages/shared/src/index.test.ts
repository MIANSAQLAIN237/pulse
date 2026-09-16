import { describe, expect, it } from "vitest";
import { deriveStatus, generateRoomCode, resultsVisibleFor, sanitizeOptions } from "./index";

describe("generateRoomCode", () => {
  it("returns 4 chars from the safe alphabet", () => {
    const code = generateRoomCode(() => new Uint8Array([0, 1, 2, 3]));
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it("never includes I, O, 0, or 1", () => {
    for (let i = 0; i < 256; i += 1) {
      const code = generateRoomCode(
        () => new Uint8Array([i, 255 - i, (i * 7) % 256, (i * 13) % 256]),
      );
      expect(code).toHaveLength(4);
      expect(code).not.toMatch(/[IO01]/);
    }
  });
});

describe("sanitizeOptions", () => {
  it("trims, drops blanks, de-dupes, caps at 8", () => {
    expect(sanitizeOptions([" A ", "", "A", "B", "C"])).toEqual(["A", "B", "C"]);
  });

  it("caps at 8 options", () => {
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    expect(sanitizeOptions(labels)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(sanitizeOptions(labels)).toHaveLength(8);
  });
});

describe("deriveStatus", () => {
  const future = new Date(Date.now() + 60_000).toISOString();

  it("prefers expired over locked", () => {
    expect(
      deriveStatus({ closed: false, locked: true, expiresAt: new Date(0).toISOString() }),
    ).toBe("expired");
  });

  it("returns closed when closed, even if locked", () => {
    expect(deriveStatus({ closed: true, locked: true, expiresAt: future })).toBe("closed");
    expect(deriveStatus({ closed: true, locked: false, expiresAt: future })).toBe("closed");
  });

  it("returns locked when locked and not closed", () => {
    expect(deriveStatus({ closed: false, locked: true, expiresAt: future })).toBe("locked");
  });

  it("returns open when not closed, locked, or expired", () => {
    expect(deriveStatus({ closed: false, locked: false, expiresAt: future })).toBe("open");
  });
});

describe("resultsVisibleFor", () => {
  it("hides counts from audience until reveal", () => {
    expect(
      resultsVisibleFor({ hideUntilReveal: true, revealed: false, isHost: false }),
    ).toBe(false);
    expect(
      resultsVisibleFor({ hideUntilReveal: true, revealed: false, isHost: true }),
    ).toBe(true);
  });

  it("lets the audience see results when hideUntilReveal is false", () => {
    expect(
      resultsVisibleFor({ hideUntilReveal: false, revealed: false, isHost: false }),
    ).toBe(true);
  });
});
