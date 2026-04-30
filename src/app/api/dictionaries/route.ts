import { DICTIONARIES } from "@/config/dictionaries";
import { REQUEST_STATUSES } from "@/config/statuses";
import { jsonOk } from "@/lib/api-response";

export function GET() {
  return jsonOk({ dictionaries: DICTIONARIES, statuses: REQUEST_STATUSES });
}
