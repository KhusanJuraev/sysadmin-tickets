const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3055";
const initSecret = process.env.INIT_SECRET || "";

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/init`, {
  method: "POST",
  headers: initSecret ? { "x-init-secret": initSecret } : {},
});

const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error(payload.error?.message || "Не удалось инициализировать Google Sheets");
  process.exit(1);
}

console.log("Google Sheets структура готова:");
console.log(payload.data);
