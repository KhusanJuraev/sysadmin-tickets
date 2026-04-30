import { jsonError, jsonOk } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/env";
import { ensureSpreadsheetStructure } from "@/lib/google/sheets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { initSecret } = getRuntimeConfig();
    const provided = request.headers.get("x-init-secret") ?? "";

    if (process.env.NODE_ENV === "production" && !initSecret) {
      throw new Error("Для production задайте INIT_SECRET");
    }

    if (initSecret && provided !== initSecret) {
      return jsonError(new Error("Неверный секрет инициализации"), 401);
    }

    const result = await ensureSpreadsheetStructure();
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
