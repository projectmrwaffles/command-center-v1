import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

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

function getRequestHost(request: Request): string | null {
  return request.headers.get("x-forwarded-host") || request.headers.get("host");
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const host = getRequestHost(request);
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    return normalizeOrigin(origin) === host;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return normalizeOrigin(referer) === host;
  }

  return false;
}

type ApiGuardOptions = {
  allowSameOrigin?: boolean;
  bearerEnvNames?: string[];
};

export function authorizeApiRequest(
  request: Request,
  options: ApiGuardOptions = {}
): { ok: true } | { ok: false; response: NextResponse } {
  const { allowSameOrigin = false, bearerEnvNames = [] } = options;

  if (allowSameOrigin && isSameOriginRequest(request)) {
    return { ok: true };
  }

  for (const envName of bearerEnvNames) {
    if (hasBearerToken(request, envName)) {
      return { ok: true };
    }
  }

  const missingEnv = bearerEnvNames.find((envName) => !process.env[envName]?.trim());
  if (missingEnv && !allowSameOrigin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${missingEnv} is not configured` },
        { status: 503 }
      ),
    };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
