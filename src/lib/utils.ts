export function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === "Да" || value === "yes";
}

export function compact<T>(items: Array<T | null | undefined | false>) {
  return items.filter(Boolean) as T[];
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSegment(value: string, fallback = "request") {
  const clean = value
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 70);
  return clean || fallback;
}

export function safeStorageFileName(value: string, fallback = "attachment") {
  const trimmed = value.trim();
  const lastDot = trimmed.lastIndexOf(".");
  const rawBase = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const rawExtension = lastDot > 0 ? trimmed.slice(lastDot + 1) : "";

  const base = rawBase
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 48);

  const extension = rawExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()
    .slice(0, 10);

  const fileName = base || fallback;
  return extension ? `${fileName}.${extension}` : fileName;
}

export function uniqueBy<T>(items: T[], selector: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
