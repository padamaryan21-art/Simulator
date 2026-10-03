import { redirect } from "next/navigation";
import { isAdminEmail } from "./admin";
import { createSupabaseServerClient } from "./supabase/server";

/** Use in Server Components / Route Handlers / Server Actions. Redirects if unauthenticated. */
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/login");
  return user;
}

/** For Route Handlers: returns null instead of redirecting so the caller can return 401. */
export async function getUserOrNull() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}
