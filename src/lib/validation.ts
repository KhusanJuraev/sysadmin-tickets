import { getCategoriesByType, getSubcategories } from "@/config/dictionaries";
import type { RequestPayload, RequestType } from "@/types";

const REQUIRED_FIELDS: Array<keyof RequestPayload> = [
  "requester_fio",
  "phone",
  "position",
  "department",
  "branch",
  "city",
  "request_type",
  "category",
  "subcategory",
  "quantity",
  "unit",
  "requirements",
];

const DEFAULT_PAYLOAD: RequestPayload = {
  requester_fio: "",
  telegram_id: "",
  telegram_username: "",
  phone: "",
  position: "",
  department: "",
  branch: "",
  city: "",
  request_type: "material",
  category: "",
  subcategory: "",
  item_name: "",
  description: "",
  quantity: "1",
  unit: "шт",
  purpose: "",
  justification: "",
  requirements: "",
  urgency: "normal",
  needed_date: "",
  delivery_address: "",
  receiver_name: "",
  receiver_contact: "",
  need_delivery: false,
  need_installation: false,
  need_purchase: "marketing_decides",
  related_object: "",
};

export function parsePayload(
  value: FormDataEntryValue | null,
  profilePatch: Partial<RequestPayload> = {},
): RequestPayload {
  if (!value || typeof value !== "string") {
    throw new Error("Не переданы данные заявки");
  }

  const data = {
    ...DEFAULT_PAYLOAD,
    ...(JSON.parse(value) as Partial<RequestPayload>),
    ...profilePatch,
  } as RequestPayload;

  data.request_type = data.request_type === "service" ? "service" : "material";
  data.telegram_id = String(data.telegram_id ?? "");
  data.telegram_username = String(data.telegram_username ?? "").replace(/^@/, "");
  data.quantity = String(data.quantity ?? "").trim();
  data.category = String(data.category ?? "").trim();
  data.subcategory = String(data.subcategory ?? "").trim();
  data.unit = String(data.unit ?? "").trim();
  data.requirements = String(data.requirements ?? "").trim();
  data.item_name = String(data.item_name || data.subcategory || data.category || "Маркетинговая заявка").trim();
  data.description = String(data.description ?? "").trim();
  data.need_delivery = Boolean(data.need_delivery);
  data.need_installation = Boolean(data.need_installation);
  data.need_purchase = data.need_purchase ?? "marketing_decides";

  const missing = REQUIRED_FIELDS.filter((field) => {
    const current = data[field];
    return current === undefined || current === null || String(current).trim() === "";
  });

  if (missing.length) {
    throw new Error(`Заполните обязательные поля: ${missing.join(", ")}`);
  }

  if (!["material", "service"].includes(data.request_type)) {
    throw new Error("Некорректный тип заявки");
  }

  const requestType = data.request_type as RequestType;
  if (!getCategoriesByType(requestType).includes(data.category)) {
    throw new Error("Выбрана некорректная категория");
  }

  if (!getSubcategories(requestType, data.category).includes(data.subcategory)) {
    throw new Error("Выбрана некорректная подкатегория");
  }

  if (data.requirements.length < 8) {
    throw new Error("Опишите требование чуть подробнее");
  }

  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Количество должно быть больше нуля");
  }

  return {
    ...data,
  };
}

export function extractFiles(formData: FormData) {
  return formData
    .getAll("files")
    .filter((file): file is File => typeof file !== "string" && file.size > 0);
}
