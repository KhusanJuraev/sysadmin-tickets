import { APP_CONFIG } from "@/config/app";
import { readSettings, updateSetting } from "@/lib/google/sheets";

export async function generateRequestId() {
  const settings = await readSettings();
  const nextNumber = Math.max(1, Number(settings.next_request_number ?? "1") || 1);
  await updateSetting("next_request_number", String(nextNumber + 1));
  return `${APP_CONFIG.requestPrefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(4, "0")}`;
}
