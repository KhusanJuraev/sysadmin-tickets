import { jsonOk } from "@/lib/api-response";
import { clearAdminCookieHeader } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return jsonOk(
    { loggedOut: true },
    {
      headers: {
        "Set-Cookie": clearAdminCookieHeader(request),
      },
    },
  );
}
