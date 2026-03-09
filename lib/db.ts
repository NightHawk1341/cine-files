import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with service role key for full access
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Public client for client-side usage (limited by RLS)
export function createPublicClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, anonKey);
}

// ============================================================
// snake_case → camelCase conversion for Supabase results
// ============================================================

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// JSONB columns whose contents should NOT be recursively camelized
const JSONB_FIELDS = new Set(['body', 'metadata', 'credits', 'preferences', 'response', 'value']);

export function camelizeKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => camelizeKeys(v)) as T;
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => {
        const camelKey = toCamelCase(k);
        return [camelKey, JSONB_FIELDS.has(k) ? v : camelizeKeys(v)];
      })
    ) as T;
  }
  return obj as T;
}

// Helper to convert camelCase to snake_case for inserts/updates
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function snakeizeKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => snakeizeKeys(v)) as T;
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => {
        const snakeKey = toSnakeCase(k);
        return [snakeKey, JSONB_FIELDS.has(k) ? v : snakeizeKeys(v)];
      })
    ) as T;
  }
  return obj as T;
}
