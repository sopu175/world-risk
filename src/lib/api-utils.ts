// Shared helpers for REST route handlers: response envelope + error mapping.

import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function fail(code: string, message: string, status = 400): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function zodFail(err: ZodError, status = 400): Response {
  const first = err.issues[0];
  const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
  return fail("validation_error", `${path}${first?.message ?? "invalid payload"}`, status);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
