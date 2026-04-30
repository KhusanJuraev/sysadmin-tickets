"use client";

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: { message: string; code?: string };
};

export class ApiClientError extends Error {
  code?: string;
  status: number;

  constructor(message: string, code: string | undefined, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

function isLocalDevOrigin() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(window.location.hostname);
}

export function getTelegramHeaders() {
  if (typeof window === "undefined") return {};
  try {
    const initData = window.Telegram?.WebApp?.initData ?? "";
    if (initData) return { "x-telegram-init-data": initData };
  } catch (error) {
    console.warn("AUTH BOOT TELEGRAM INITDATA READ FAILED", error);
  }

  if (!isLocalDevOrigin()) {
    console.warn("AUTH BOOT DEV AUTH SKIPPED", {
      host: window.location.hostname,
      reason: "dev auth allowed only on localhost",
    });
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const urlRole = params.get("role");
  let savedRole = "";
  try {
    savedRole = window.localStorage.getItem("devRole") ?? "";
  } catch (error) {
    console.warn("AUTH BOOT LOCALSTORAGE READ FAILED", error);
  }

  const role = urlRole ?? savedRole ?? "employee";
  if (urlRole) {
    try {
      window.localStorage.setItem("devRole", role);
    } catch (error) {
      console.warn("AUTH BOOT LOCALSTORAGE WRITE FAILED", error);
    }
  }
  const id = role === "employee" ? "100001" : role === "marketing_head" ? "300003" : "200002";

  return {
    "x-dev-role": role,
    "x-dev-telegram-id": id,
    "x-dev-telegram-username": role === "employee" ? "employee_demo" : "marketing_demo",
  };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  Object.entries(getTelegramHeaders()).forEach(([key, value]) => headers.set(key, value));

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const contentType = response.headers.get("content-type") ?? "";
  let data: ApiResult<T>;

  if (contentType.includes("application/json")) {
    try {
      data = (await response.json()) as ApiResult<T>;
    } catch {
      data = {
        ok: false,
        error: { message: "Сервер вернул некорректный JSON-ответ" },
      };
    }
  } else {
    const text = await response.text().catch(() => "");
    const message =
      response.status === 413
        ? "Файл слишком большой. Попробуйте выбрать файл меньшего размера или отправьте заявку без вложения."
        : text.trim() || "Сервер вернул неожиданный ответ";
    data = { ok: false, error: { message } };
  }

  if (!response.ok || !data.ok) {
    throw new ApiClientError(
      data.error?.message ?? "Ошибка запроса",
      data.error?.code,
      response.status,
    );
  }
  return data.data as T;
}
