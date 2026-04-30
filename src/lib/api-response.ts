import { ConfigurationError } from "@/lib/env";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function jsonError(error: unknown, status = 500) {
  const isConfig = error instanceof ConfigurationError;
  const errorCode =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : isConfig
        ? "CONFIGURATION_ERROR"
        : "SERVER_ERROR";
  const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
  return Response.json(
    {
      ok: false,
      error: {
        message,
        code: errorCode,
      },
    },
    { status: errorCode === "PROFILE_NOT_COMPLETED" ? 403 : isConfig ? 503 : status },
  );
}
