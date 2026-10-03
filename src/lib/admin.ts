/**
 * Optional allow-list of dashboard administrators (comma-separated emails in ADMIN_EMAILS).
 * Every signed-in user is an administrator, so if Supabase sign-ups are open this is what keeps a
 * stranger who registers out. Unset = any signed-in user is allowed (single-user setups, tests).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return !!email && list.includes(email.toLowerCase());
}
