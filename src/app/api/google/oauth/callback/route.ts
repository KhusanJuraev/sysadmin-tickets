import { completeGoogleOAuth, verifyOAuthState } from "@/lib/google/oauth";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(title: string, message: string, tone: "success" | "error") {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const color = tone === "success" ? "#047857" : "#be123c";
  const bg = tone === "success" ? "#ecfdf5" : "#fff1f2";
  return new Response(
    `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; color: #18181b; }
      main { width: min(440px, calc(100vw - 32px)); border: 1px solid #e4e7ec; border-radius: 18px; background: white; padding: 28px; box-shadow: 0 24px 70px rgba(15, 23, 42, .08); }
      .badge { display: inline-flex; border-radius: 999px; background: ${bg}; color: ${color}; padding: 6px 10px; font-size: 13px; font-weight: 700; }
      h1 { margin: 18px 0 8px; font-size: 24px; letter-spacing: -.02em; }
      p { margin: 0; color: #52525b; line-height: 1.6; }
      a { display: inline-flex; margin-top: 22px; min-height: 44px; align-items: center; justify-content: center; border-radius: 12px; background: #0369a1; color: white; padding: 0 16px; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <span class="badge">${tone === "success" ? "Подключено" : "Ошибка"}</span>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <a href="/admin">Вернуться в админ-панель</a>
    </main>
  </body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  try {
    if (error) throw new Error(`Google OAuth: ${error}`);
    if (!code || !state) throw new Error("Google OAuth callback не содержит code/state");

    const payload = verifyOAuthState(state);
    if (payload.role !== "marketing" && payload.role !== "marketing_head") {
      throw new Error("Подключать Google Drive может только администратор");
    }

    const saved = await completeGoogleOAuth(code);
    return html(
      "Google Drive подключен",
      saved.connected_google_email
        ? `Файлы заявок будут загружаться в Drive аккаунта ${saved.connected_google_email}.`
        : "Файлы заявок будут загружаться в подключенный Google Drive аккаунт.",
      "success",
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Не удалось подключить Google Drive";
    return html("Не удалось подключить Google Drive", message, "error");
  }
}
