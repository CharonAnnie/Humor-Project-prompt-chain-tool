"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out. Deliberately *not* gated on `requireSuperadmin()`: the Access denied
 * page needs this, and the whole point of that page is that the visitor is not
 * an admin. Clearing your own session is not a privileged operation.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
