export const APP_CONFIG = {
  companyName: "TURON TELECOM",
  productName: "Технический отдел заявки",
  localPort: 3055,
  defaultTimezone: "Asia/Tashkent",
  requestPrefix: "MKT-REQ",
  maxUploadMb: 50,
  allowedFileExtensions: ["jpg", "jpeg", "png", "pdf", "doc", "docx", "xls", "xlsx", "mp4", "mov"],
} as const;

export const ROLE_LABELS = {
  employee: "Сотрудник",
  marketing: "Маркетинг",
  marketing_head: "Руководитель маркетинга",
} as const;

export const REQUEST_TYPE_LABELS = {
  material: "Материал",
  service: "Услуга",
} as const;

export const NEED_PURCHASE_LABELS = {
  yes: "Да",
  no: "Нет",
  marketing_decides: "Определить маркетингом",
} as const;
