import { route } from "@/lib/api";
import { createAccount, listAccounts } from "@/server/telegram/accounts";
import { createAccountSchema } from "@/validators/telegram";

export const GET = route(async () => listAccounts());

export const POST = route(async ({ body }) => createAccount(await body(createAccountSchema)));
