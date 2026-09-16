import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "pulse_voter";
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

export function assertSessionSecret(): void {
  sessionSecret();
}

export function hashHostToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function randomHostToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyHostToken(token: string, hash: string): boolean {
  const digest = hashHostToken(token);
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(hash, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function signVoterToken(voterId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(voterId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyVoterToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub === "string" && payload.sub.length > 0) {
      return payload.sub;
    }
    return null;
  } catch {
    return null;
  }
}

export function setVoterCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
  });
}

export async function voterIdFromCookies(
  cookies: Record<string, string | undefined>,
): Promise<{ voterId: string; issuedToken: string | null }> {
  const existing = cookies[COOKIE_NAME];
  if (existing) {
    const voterId = await verifyVoterToken(existing);
    if (voterId) return { voterId, issuedToken: null };
  }
  const voterId = crypto.randomUUID();
  const issuedToken = await signVoterToken(voterId);
  return { voterId, issuedToken };
}

export async function readExistingVoterId(
  cookieHeader: string | undefined,
): Promise<string | null> {
  const cookies = parseCookie(cookieHeader ?? "");
  const existing = cookies[COOKIE_NAME];
  if (!existing) return null;
  return verifyVoterToken(existing);
}

export async function getOrCreateVoter(req: Request, res: Response): Promise<string> {
  const { voterId, issuedToken } = await voterIdFromCookies(req.cookies ?? {});
  if (issuedToken) setVoterCookie(res, issuedToken);
  return voterId;
}
