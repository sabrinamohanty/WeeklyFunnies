import { ApiError } from "@/lib/http/errors";

interface PgError {
  code?: string;
  message?: string;
}

// Named exceptions raised by our triggers and functions, mapped to client-safe codes.
const RAISED: Record<string, ConstructorParameters<typeof ApiError>[0]> = {
  edition_locked: "edition_locked",
  paper_full: "conflict",
  invite_not_found: "not_found",
};

/** Converts a database error into an ApiError. Unknown errors become `internal`, with no details. */
export function dbError(err: PgError): ApiError {
  if (err.code === "P0001" && err.message && RAISED[err.message]) return new ApiError(RAISED[err.message]!);
  if (err.code === "23505") return new ApiError("conflict");
  return new ApiError("internal", { cause: err });
}

/** Unwraps a Supabase response that must have data, throwing a mapped ApiError on failure. */
export function unwrap<R extends { data: unknown; error: PgError | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw dbError(res.error);
  if (res.data === null || res.data === undefined) throw new ApiError("internal");
  return res.data as NonNullable<R["data"]>;
}

/** Unwraps a Supabase response where no row is a valid answer (e.g. `maybeSingle`). */
export function unwrapMaybe<R extends { data: unknown; error: PgError | null }>(
  res: R,
): NonNullable<R["data"]> | null {
  if (res.error) throw dbError(res.error);
  return (res.data ?? null) as NonNullable<R["data"]> | null;
}
