import { z } from "zod";
import { HttpError, notFound, route } from "@/lib/api";
import { getAccountRow, toPublicAccount } from "@/server/telegram/accounts";
import {
  cancelLogin,
  sendLoginCode,
  verifyLoginCode,
  verifyLoginPassword,
} from "@/server/telegram/auth";
import { checkConnection, disconnectAccount, reconnectAccount } from "@/server/telegram/connection";
import { sendCodeSchema, verifyCodeSchema, verifyPasswordSchema } from "@/validators/telegram";

const params = z.object({
  id: z.string().uuid(),
  action: z.enum([
    "send-code",
    "verify-code",
    "verify-password",
    "cancel",
    "check",
    "reconnect",
    "disconnect",
  ]),
});

export const POST = route<{ id: string; action: string }>(
  async ({ params: raw, body }) => {
    const { id, action } = params.parse(raw);
    if (!(await getAccountRow(id))) throw notFound();

    switch (action) {
      case "send-code": {
        const { phone } = await body(sendCodeSchema);
        await sendLoginCode(id, phone);
        return { status: "AWAITING_CODE" };
      }
      case "verify-code": {
        const { code } = await body(verifyCodeSchema);
        return { status: await verifyLoginCode(id, code) };
      }
      case "verify-password": {
        const { password } = await body(verifyPasswordSchema);
        await verifyLoginPassword(id, password);
        return { status: "CONNECTED" };
      }
      case "cancel":
        await cancelLogin(id);
        return { ok: true };
      case "check":
        return checkConnection(id);
      case "reconnect":
        return reconnectAccount(id);
      case "disconnect": {
        await disconnectAccount(id);
        const row = await getAccountRow(id);
        if (!row) throw new HttpError(404, "Not found");
        return toPublicAccount(row);
      }
    }
  },
  { rateLimit: { limit: 20, windowSec: 60 } },
);
