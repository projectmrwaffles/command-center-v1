import { timingSafeEqual } from "node:crypto";

function constantTimeMatch(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function hasBearerToken(request: Request, envName: string): boolean {
  const expected = process.env[envName]?.trim();
  if (!expected) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  return constantTimeMatch(authHeader.slice(7), expected);
}
