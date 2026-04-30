import { STATUS_LABELS } from "@/config/statuses";
import {
  appendObject,
  getValues,
  readSheetObjects,
  objectToRow,
  updateObjectByKey,
  updateValues,
} from "@/lib/google/sheets";
import {
  HISTORY_HEADERS,
  REQUEST_HEADERS,
  SHEET_NAMES,
  USER_HEADERS,
} from "@/lib/google/sheets-schema";
import { normalizeBoolean } from "@/lib/utils";
import type {
  AppUser,
  MarketingRequest,
  OnboardingStep,
  RequestPayload,
  RequestStatus,
  RegistrationStatus,
  StatusHistoryEntry,
  UserRole,
} from "@/types";

type Row = Record<string, string>;

export type UserLookup = {
  user: AppUser;
  raw: Row;
  headers: string[];
  rowNumber: number;
};

function columnLetter(index: number) {
  let number = index + 1;
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function rowToObject(headers: readonly string[], row: string[]) {
  const result: Row = {};
  headers.forEach((header, index) => {
    result[header] = String(row[index] ?? "");
  });
  return result;
}

function normalizeRole(value: string): UserRole {
  if (value === "marketing" || value === "marketing_head") return value;
  return "employee";
}

function mapRequest(row: Row): MarketingRequest {
  return {
    request_id: row.request_id ?? "",
    created_at: row.created_at ?? "",
    created_date: row.created_date ?? "",
    requester_fio: row.requester_fio ?? "",
    telegram_id: row.telegram_id ?? "",
    telegram_username: row.telegram_username ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    department: row.department ?? "",
    branch: row.branch ?? "",
    city: row.city ?? "",
    request_type: row.request_type === "service" ? "service" : "material",
    category: row.category ?? "",
    subcategory: row.subcategory ?? "",
    item_name: row.item_name ?? "",
    description: row.description ?? "",
    quantity: row.quantity ?? "",
    unit: row.unit ?? "",
    purpose: row.purpose ?? "",
    justification: row.justification ?? "",
    requirements: row.requirements ?? "",
    urgency: row.urgency ?? "",
    needed_date: row.needed_date ?? "",
    delivery_address: row.delivery_address ?? "",
    receiver_name: row.receiver_name ?? "",
    receiver_contact: row.receiver_contact ?? "",
    need_delivery: normalizeBoolean(row.need_delivery),
    need_installation: normalizeBoolean(row.need_installation),
    need_purchase:
      row.need_purchase === "yes" || row.need_purchase === "no" || row.need_purchase === "marketing_decides"
        ? row.need_purchase
        : "marketing_decides",
    related_object: row.related_object ?? "",
    attachments_folder_url: row.attachments_folder_url ?? "",
    attachments_list_json: row.attachments_list_json ?? "[]",
    attachments_urls: row.attachments_urls ?? "",
    drive_folder_url: row.drive_folder_url || row.attachments_folder_url || "",
    upload_warnings: row.upload_warnings ?? "",
    current_status: (row.current_status || "new") as RequestStatus,
    current_status_label: row.current_status_label || STATUS_LABELS.new,
    marketing_comment: row.marketing_comment ?? "",
    assigned_marketing_user: row.assigned_marketing_user ?? "",
    purchase_required: row.purchase_required ?? "",
    purchase_request_no: row.purchase_request_no ?? "",
    sent_at: row.sent_at ?? "",
    completed_at: row.completed_at ?? "",
    closed_at: row.closed_at ?? "",
    last_updated_at: row.last_updated_at ?? "",
  };
}

function mapHistory(row: Row): StatusHistoryEntry {
  return {
    request_id: row.request_id ?? "",
    changed_at: row.changed_at ?? "",
    changed_by: row.changed_by ?? "",
    changed_by_role: (row.changed_by_role as UserRole | "system") || "system",
    old_status: row.old_status ?? "",
    new_status: (row.new_status || "new") as RequestStatus,
    comment: row.comment ?? "",
    requester_telegram_id: row.requester_telegram_id ?? "",
    notification_sent: row.notification_sent ?? "",
    notification_sent_at: row.notification_sent_at ?? "",
    notification_text: row.notification_text ?? "",
  };
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  "new",
  "collecting_fio",
  "collecting_phone",
  "collecting_location",
  "collecting_position",
  "collecting_department",
  "collecting_office",
  "completed",
];

function normalizeRegistrationStatus(row: Row): RegistrationStatus {
  if (row.registration_status === "completed") return "completed";
  const officeLocation = row.office_location || row.branch || "";
  const hasLegacyProfile = Boolean(row.fio && row.phone && row.position && row.department && officeLocation);
  return !row.registration_status && hasLegacyProfile ? "completed" : "new";
}

function normalizeOnboardingStep(value: string, status: RegistrationStatus): OnboardingStep {
  if (ONBOARDING_STEPS.includes(value as OnboardingStep)) return value as OnboardingStep;
  return status === "completed" ? "completed" : "collecting_fio";
}

function mapUser(row: Row): AppUser {
  const registrationStatus = normalizeRegistrationStatus(row);
  const officeLocation = row.office_location || row.branch || "";
  const isActiveValue = String(row.is_active ?? "").toLowerCase();

  return {
    telegram_id: row.telegram_id ?? "",
    username: row.username ?? "",
    telegram_first_name: row.telegram_first_name ?? "",
    telegram_last_name: row.telegram_last_name ?? "",
    fio: row.fio ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    department: row.department ?? "",
    branch: officeLocation,
    office_location: officeLocation,
    geo_lat: row.geo_lat ?? "",
    geo_lng: row.geo_lng ?? "",
    registration_status: registrationStatus,
    onboarding_step: normalizeOnboardingStep(row.onboarding_step ?? "", registrationStatus),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    role: normalizeRole(row.role ?? ""),
    is_active: isActiveValue !== "false" && isActiveValue !== "\u043d\u0435\u0442" && isActiveValue !== "no",
  };
}

export async function getUserByTelegramId(telegramId: string) {
  const rows = await readSheetObjects<Row>(SHEET_NAMES.users, USER_HEADERS);
  const found = rows.find((row) => row.telegram_id === telegramId);
  return found ? mapUser(found) : null;
}

export async function getUserLookupByTelegramId(telegramId: string): Promise<UserLookup | null> {
  const rows = await getValues(SHEET_NAMES.users);
  const headers = (rows[0]?.length ? rows[0] : [...USER_HEADERS]) as string[];
  const telegramIdIndex = headers.indexOf("telegram_id");
  if (telegramIdIndex === -1) {
    throw new Error("В листе Пользователи не найдена колонка telegram_id");
  }

  const rowIndex = rows.findIndex((row, index) => index > 0 && row[telegramIdIndex] === telegramId);
  if (rowIndex === -1) return null;

  const raw = rowToObject(headers, rows[rowIndex]);
  return {
    user: mapUser(raw),
    raw,
    headers,
    rowNumber: rowIndex + 1,
  };
}

export async function createUserRecord(user: AppUser) {
  await appendObject(SHEET_NAMES.users, USER_HEADERS, {
    ...user,
    office_location: user.office_location || user.branch,
    is_active: user.is_active ? "TRUE" : "FALSE",
  });
  return user;
}

export async function updateUserLookup(lookup: UserLookup, patch: Partial<AppUser>) {
  const mergedRaw: Row = { ...lookup.raw };
  Object.entries(patch).forEach(([key, value]) => {
    mergedRaw[key] = value === undefined || value === null ? "" : String(value);
  });

  if (patch.branch && !patch.office_location) {
    mergedRaw.office_location = patch.branch;
  }

  await updateValues(
    SHEET_NAMES.users,
    `A${lookup.rowNumber}:${columnLetter(lookup.headers.length - 1)}${lookup.rowNumber}`,
    [objectToRow(lookup.headers, mergedRaw)],
  );

  return mapUser(mergedRaw);
}

export async function upsertUser(user: AppUser) {
  const existing = await getUserByTelegramId(user.telegram_id);
  if (existing) {
    const officeLocation = user.office_location || user.branch || existing.office_location || existing.branch;
    await updateObjectByKey(SHEET_NAMES.users, USER_HEADERS, "telegram_id", user.telegram_id, {
      username: user.username || existing.username,
      telegram_first_name: user.telegram_first_name || existing.telegram_first_name,
      telegram_last_name: user.telegram_last_name || existing.telegram_last_name,
      fio: user.fio || existing.fio,
      phone: user.phone || existing.phone,
      position: user.position || existing.position,
      department: user.department || existing.department,
      office_location: officeLocation,
      geo_lat: user.geo_lat || existing.geo_lat,
      geo_lng: user.geo_lng || existing.geo_lng,
      registration_status: user.registration_status || existing.registration_status,
      onboarding_step: user.onboarding_step || existing.onboarding_step,
      created_at: existing.created_at || user.created_at,
      updated_at: user.updated_at || existing.updated_at,
      role: existing.role || user.role,
      is_active: existing.is_active,
    });
    return { ...existing, ...user, branch: officeLocation, office_location: officeLocation, role: existing.role, is_active: existing.is_active };
  }

  await appendObject(SHEET_NAMES.users, USER_HEADERS, {
    ...user,
    office_location: user.office_location || user.branch,
    is_active: user.is_active ? "TRUE" : "FALSE",
  });
  return user;
}

export async function updateUserByTelegramId(telegramId: string, patch: Partial<AppUser>) {
  await updateObjectByKey(SHEET_NAMES.users, USER_HEADERS, "telegram_id", telegramId, patch);
  return getUserByTelegramId(telegramId);
}

export async function listRequests() {
  const rows = await readSheetObjects<Row>(SHEET_NAMES.requests, REQUEST_HEADERS);
  return rows.map(mapRequest).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listRequestsForTelegramId(telegramId: string) {
  const rows = await listRequests();
  return rows.filter((request) => request.telegram_id === telegramId);
}

export async function getRequestById(requestId: string) {
  const rows = await listRequests();
  return rows.find((request) => request.request_id === requestId) ?? null;
}

export async function createRequestRecord(request: MarketingRequest) {
  await appendObject(SHEET_NAMES.requests, REQUEST_HEADERS, request);
}

export async function updateRequestRecord(requestId: string, patch: Partial<MarketingRequest>) {
  await updateObjectByKey(SHEET_NAMES.requests, REQUEST_HEADERS, "request_id", requestId, patch);
}

export async function appendHistory(entry: StatusHistoryEntry) {
  await appendObject(SHEET_NAMES.history, HISTORY_HEADERS, entry);
}

export async function getHistoryByRequestId(requestId: string) {
  const rows = await readSheetObjects<Row>(SHEET_NAMES.history, HISTORY_HEADERS);
  return rows.filter((row) => row.request_id === requestId).map(mapHistory);
}

export function mergeProfileIntoUser(user: AppUser, payload: RequestPayload): AppUser {
  return {
    ...user,
    fio: payload.requester_fio || user.fio,
    username: payload.telegram_username || user.username,
    phone: payload.phone || user.phone,
    position: payload.position || user.position,
    department: payload.department || user.department,
    branch: payload.branch || user.branch,
    office_location: payload.branch || user.office_location || user.branch,
  };
}
