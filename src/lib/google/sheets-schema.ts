import { APP_CONFIG } from "@/config/app";
import { DICTIONARIES } from "@/config/dictionaries";
import { REQUEST_STATUSES } from "@/config/statuses";

export const SHEET_NAMES = {
  requests: "Заявки",
  history: "История_статусов",
  dictionaries: "Справочники",
  users: "Пользователи",
  settings: "Настройки",
} as const;

export const REQUEST_HEADERS = [
  "request_id",
  "created_at",
  "created_date",
  "requester_fio",
  "telegram_id",
  "telegram_username",
  "phone",
  "position",
  "department",
  "branch",
  "city",
  "request_type",
  "category",
  "subcategory",
  "item_name",
  "description",
  "quantity",
  "unit",
  "purpose",
  "justification",
  "requirements",
  "urgency",
  "needed_date",
  "delivery_address",
  "receiver_name",
  "receiver_contact",
  "need_delivery",
  "need_installation",
  "need_purchase",
  "related_object",
  "attachments_folder_url",
  "attachments_list_json",
  "attachments_urls",
  "drive_folder_url",
  "upload_warnings",
  "current_status",
  "current_status_label",
  "marketing_comment",
  "assigned_marketing_user",
  "purchase_required",
  "purchase_request_no",
  "sent_at",
  "completed_at",
  "closed_at",
  "last_updated_at",
] as const;

export const HISTORY_HEADERS = [
  "request_id",
  "changed_at",
  "changed_by",
  "changed_by_role",
  "old_status",
  "new_status",
  "comment",
  "requester_telegram_id",
  "notification_sent",
  "notification_sent_at",
  "notification_text",
] as const;

export const USER_HEADERS = [
  "telegram_id",
  "username",
  "telegram_first_name",
  "telegram_last_name",
  "fio",
  "phone",
  "position",
  "department",
  "office_location",
  "geo_lat",
  "geo_lng",
  "registration_status",
  "onboarding_step",
  "created_at",
  "updated_at",
  "role",
  "is_active",
] as const;

export const SETTINGS_HEADERS = ["key", "value", "updated_at", "comment"] as const;

export const DICTIONARY_HEADERS = ["dictionary_key", "parent_key", "value", "label", "is_active"] as const;

export function getDefaultSettings() {
  return [
    ["next_request_number", "1", new Date().toISOString(), "Следующий порядковый номер заявки"],
    ["telegram_marketing_chat_id", process.env.TELEGRAM_MARKETING_CHAT_ID ?? "", new Date().toISOString(), "Чат маркетинга"],
    [
      "google_drive_parent_folder_id",
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ?? "1YuvyheL3aye8fa6HxgoCp8pmqXm_0wEN",
      new Date().toISOString(),
      "Корневая папка Google Drive",
    ],
    ["default_timezone", APP_CONFIG.defaultTimezone, new Date().toISOString(), "Часовой пояс"],
    ["company_name", APP_CONFIG.companyName, new Date().toISOString(), "Название компании"],
  ];
}

export function getDictionarySeedRows() {
  const rows: string[][] = [];
  const pushList = (key: string, list: readonly string[], parent = "") => {
    list.forEach((value) => rows.push([key, parent, value, value, "TRUE"]));
  };

  pushList("departments", DICTIONARIES.departments);
  pushList("positions", DICTIONARIES.positions);
  pushList("branches", DICTIONARIES.branches);
  pushList("cities", DICTIONARIES.cities);
  pushList("Office", DICTIONARIES.units);
  pushList(
    "status_list",
    REQUEST_STATUSES.map((status) => status.label),
  );
  pushList(
    "material_categories",
    Object.keys(DICTIONARIES.materialCategories),
  );
  Object.entries(DICTIONARIES.materialCategories).forEach(([parent, values]) => {
    pushList("material_subcategories", values as readonly string[], parent);
  });
  pushList(
    "service_categories",
    Object.keys(DICTIONARIES.serviceCategories),
  );
  Object.entries(DICTIONARIES.serviceCategories).forEach(([parent, values]) => {
    pushList("service_subcategories", values as readonly string[], parent);
  });

  return rows;
}
