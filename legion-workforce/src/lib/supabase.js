import { createClient } from "@supabase/supabase-js";

export function isPublicSupabaseKey(key) {
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_")) return false;
  try {
    const encoded = key.split(".")[1];
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch { return false; }
}
const environment = import.meta.env || {};
const configuredDomain = String(environment.VITE_SSO_DOMAIN || "").trim().toLowerCase();
export const ssoDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(configuredDomain) ? configuredDomain : "";
export const allowSignup = environment.VITE_ALLOW_SIGNUP === "true";
const url = String(environment.VITE_SUPABASE_URL || "").trim();
const key = String(environment.VITE_SUPABASE_ANON_KEY || "").trim();
let validUrl = false;
try {
  const parsed = new URL(url);
  validUrl = parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
} catch { /* The setup screen explains missing configuration. */ }
export const supabaseConfigured = validUrl && isPublicSupabaseKey(key);

async function boundedFetch(input, init) {
  const controller = new AbortController(), inherited = init?.signal;
  const abort = () => controller.abort();
  if (inherited?.aborted) abort();
  inherited?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); inherited?.removeEventListener("abort", abort); }
}
const clientCache = globalThis.__legionSupabaseClients ??= new Map();
const clientCacheKey = JSON.stringify([url, key]);

if (supabaseConfigured && !clientCache.has(clientCacheKey)) {
  clientCache.set(clientCacheKey, createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    global: { fetch: boundedFetch },
  }));
}

export const supabase = supabaseConfigured
  ? clientCache.get(clientCacheKey)
  : null;