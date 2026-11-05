import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

// Server client for Server Components, Server Functions and Route Handlers.
//
// This is the only key the admin panel ever holds: the publishable anon key.
// There is no service-role key anywhere in this project, so every row this
// client can see is a row RLS decided to show the signed-in user -- which is
// what makes `is_superadmin` the actual gate rather than a UI convention.
//
// `cookies()` is async in Next 16, so every caller awaits this.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies. Harmless: a refreshed session
          // is written by `proxy.ts` on the next request instead.
        }
      },
    },
  });
}
