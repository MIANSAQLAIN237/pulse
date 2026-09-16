import { generateRoomCode } from "@pulse/shared";
import { describe, expect, it } from "vitest";

describe("generateRoomCode", () => {
  it("produces unique 4-char codes for 50 deterministic seeds", () => {
    const codes = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      const bytes = new Uint8Array([
        i % 32,
        Math.floor(i / 32) % 32,
        (i * 3) % 32,
        (i * 5 + 7) % 32,
      ]);
      const code = generateRoomCode((size) => {
        expect(size).toBe(4);
        return bytes;
      });
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      codes.add(code);
    }

    expect(codes.size).toBe(50);
  });
});
