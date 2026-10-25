import { randomUUID } from "node:crypto";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { inject } from "vitest";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export function env() {
  return inject("supabase");
}

export function serviceClient(): SupabaseClient {
  const { url, serviceKey } = env();
  return createClient(url, serviceKey, opts);
}

export function anonClient(): SupabaseClient {
  const { url, anonKey } = env();
  return createClient(url, anonKey, opts);
}

/** A client that acts as a signed-in user, the way a leaked app token would reach Supabase directly. */
export function clientWithToken(token: string): SupabaseClient {
  const { url, anonKey } = env();
  return createClient(url, anonKey, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  client: SupabaseClient;
}

export async function createUser(label: string): Promise<TestUser> {
  const admin = serviceClient();
  const email = `${label}-${randomUUID()}@test.meanwhile.local`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");

  const signIn = await anonClient().auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("signIn failed");
  const token = signIn.data.session.access_token;
  return { id: data.user.id, email, token, client: clientWithToken(token) };
}

export async function deleteUsers(users: TestUser[]): Promise<void> {
  const admin = serviceClient();
  await Promise.all(users.map((u) => admin.auth.admin.deleteUser(u.id)));
}

/** Throws with the Postgres error message if a service-role call fails. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error("no data");
  return res.data as NonNullable<T>;
}

// A valid 1x1 PNG.
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const MONDAY = "2026-10-19";
export const PREVIOUS_MONDAY = "2026-10-12";
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

export async function upload(bucket: string, path: string): Promise<void> {
  const { error } = await serviceClient()
    .storage.from(bucket)
    .upload(path, PNG_BYTES, { contentType: "image/png" });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

export async function objectExists(bucket: string, path: string): Promise<boolean> {
  const { data } = await serviceClient().storage.from(bucket).download(path);
  return data !== null;
}
