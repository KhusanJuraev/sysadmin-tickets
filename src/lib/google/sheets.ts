import { getGoogleAccessToken } from "@/lib/google/auth";
import { getGoogleConfig } from "@/lib/env";
import {
  DICTIONARY_HEADERS,
  getDefaultSettings,
  getDictionarySeedRows,
  HISTORY_HEADERS,
  REQUEST_HEADERS,
  SETTINGS_HEADERS,
  SHEET_NAMES,
  USER_HEADERS,
} from "@/lib/google/sheets-schema";
import { nowIso } from "@/lib/datetime";

type RowObject = Record<string, string>;

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function quoteSheet(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

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

async function googleFetch(path: string, init?: RequestInit) {
  const { spreadsheetId } = getGoogleConfig();
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Sheets API error: ${details}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function getSpreadsheetSheets() {
  const data = (await googleFetch("?fields=sheets.properties.title")) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  return new Set(data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean) as string[]);
}

async function batchUpdate(requests: unknown[]) {
  if (requests.length === 0) return;
  await googleFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function getValues(sheetName: string, range = "A:ZZ") {
  const encodedRange = encodeURIComponent(`${quoteSheet(sheetName)}!${range}`);
  const data = (await googleFetch(`/values/${encodedRange}`)) as { values?: string[][] };
  return data.values ?? [];
}

export async function updateValues(sheetName: string, startCell: string, values: unknown[][]) {
  const range = `${quoteSheet(sheetName)}!${startCell}`;
  await googleFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

export async function appendValues(sheetName: string, values: unknown[][]) {
  const range = `${quoteSheet(sheetName)}!A1`;
  await googleFetch(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values }),
  });
}

export async function clearValues(sheetName: string, range = "A2:ZZ") {
  await googleFetch(`/values/${encodeURIComponent(`${quoteSheet(sheetName)}!${range}`)}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function rowsToObjects<T extends RowObject = RowObject>(headers: readonly string[], rows: string[][]): T[] {
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => {
      const result: RowObject = {};
      headers.forEach((header, index) => {
        result[header] = String(row[index] ?? "");
      });
      return result as T;
    });
}

export function objectToRow(headers: readonly string[], item: Record<string, unknown>) {
  return headers.map((header) => {
    const value = item[header];
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

async function ensureHeaders(sheetName: string, headers: readonly string[]) {
  const endColumn = columnLetter(headers.length - 1);
  await updateValues(sheetName, `A1:${endColumn}1`, [headers as unknown as string[]]);
}

async function ensureSettingsDefaults() {
  const rows = await getValues(SHEET_NAMES.settings);
  const headers = rows[0] ?? [];
  const keyIndex = headers.indexOf("key");
  const existing = new Set(rows.slice(1).map((row) => row[keyIndex]).filter(Boolean));
  const missing = getDefaultSettings().filter((row) => !existing.has(row[0]));
  if (missing.length) {
    await appendValues(SHEET_NAMES.settings, missing);
  }
}

async function seedDictionariesIfEmpty() {
  const rows = await getValues(SHEET_NAMES.dictionaries);
  if (rows.length <= 1) {
    await appendValues(SHEET_NAMES.dictionaries, getDictionarySeedRows());
  }
}

function normalizeUserForCurrentHeaders(row: RowObject) {
  const timestamp = nowIso();
  const officeLocation = row.office_location || row.branch || "";
  const hasProfile = Boolean(row.fio && row.phone && row.position && row.department && officeLocation);
  const registrationStatus = row.registration_status === "completed" || (!row.registration_status && hasProfile) ? "completed" : "new";

  return {
    telegram_id: row.telegram_id ?? "",
    username: row.username ?? "",
    telegram_first_name: row.telegram_first_name ?? "",
    telegram_last_name: row.telegram_last_name ?? "",
    fio: row.fio ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    department: row.department ?? "",
    office_location: officeLocation,
    geo_lat: row.geo_lat ?? "",
    geo_lng: row.geo_lng ?? "",
    registration_status: registrationStatus,
    onboarding_step: row.onboarding_step || (registrationStatus === "completed" ? "completed" : "collecting_fio"),
    created_at: row.created_at || timestamp,
    updated_at: row.updated_at || timestamp,
    role: row.role || "employee",
    is_active: row.is_active || "TRUE",
  };
}

async function ensureUsersHeaders() {
  const rows = await getValues(SHEET_NAMES.users);
  const actualHeaders = rows[0] ?? [];
  const alreadyCurrent = USER_HEADERS.every((header, index) => actualHeaders[index] === header);

  if (!rows.length || alreadyCurrent) {
    await ensureHeaders(SHEET_NAMES.users, USER_HEADERS);
    return;
  }

  const migrated = rowsToObjects<RowObject>(actualHeaders, rows)
    .map(normalizeUserForCurrentHeaders)
    .filter((row) => row.telegram_id);

  await ensureHeaders(SHEET_NAMES.users, USER_HEADERS);
  await clearValues(SHEET_NAMES.users);

  if (migrated.length) {
    await appendValues(
      SHEET_NAMES.users,
      migrated.map((row) => objectToRow(USER_HEADERS, row)),
    );
  }
}

export async function ensureSpreadsheetStructure() {
  const existing = await getSpreadsheetSheets();
  const definitions = [
    { name: SHEET_NAMES.requests, headers: REQUEST_HEADERS },
    { name: SHEET_NAMES.history, headers: HISTORY_HEADERS },
    { name: SHEET_NAMES.dictionaries, headers: DICTIONARY_HEADERS },
    { name: SHEET_NAMES.users, headers: USER_HEADERS },
    { name: SHEET_NAMES.settings, headers: SETTINGS_HEADERS },
  ];

  await batchUpdate(
    definitions
      .filter((definition) => !existing.has(definition.name))
      .map((definition) => ({
        addSheet: {
          properties: {
            title: definition.name,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      })),
  );

  for (const definition of definitions) {
    if (definition.name === SHEET_NAMES.users) {
      await ensureUsersHeaders();
    } else {
      await ensureHeaders(definition.name, definition.headers);
    }
  }

  await ensureSettingsDefaults();
  await seedDictionariesIfEmpty();

  return { sheets: definitions.map((definition) => definition.name), initializedAt: nowIso() };
}

export async function readSettings() {
  const rows = await getValues(SHEET_NAMES.settings);
  const headers = rows[0] ?? [];
  const keyIndex = headers.indexOf("key");
  const valueIndex = headers.indexOf("value");
  const result: Record<string, string> = {};
  rows.slice(1).forEach((row) => {
    const key = row[keyIndex];
    if (key) result[key] = row[valueIndex] ?? "";
  });
  return result;
}

export async function updateSetting(key: string, value: string) {
  const rows = await getValues(SHEET_NAMES.settings);
  const headers = rows[0] ?? [];
  const keyIndex = headers.indexOf("key");
  const valueIndex = headers.indexOf("value");
  const updatedIndex = headers.indexOf("updated_at");
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[keyIndex] === key);
  if (rowIndex === -1) {
    await appendValues(SHEET_NAMES.settings, [[key, value, nowIso(), ""]]);
    return;
  }
  const row = [...rows[rowIndex]];
  row[valueIndex] = value;
  if (updatedIndex >= 0) row[updatedIndex] = nowIso();
  await updateValues(SHEET_NAMES.settings, `A${rowIndex + 1}:${columnLetter(headers.length - 1)}${rowIndex + 1}`, [row]);
}

export async function readSheetObjects<T extends RowObject>(sheetName: string, headers: readonly string[]) {
  const rows = await getValues(sheetName);
  const actualHeaders = rows[0]?.length ? rows[0] : (headers as unknown as string[]);
  return rowsToObjects<T>(actualHeaders, rows.length ? rows : [actualHeaders]);
}

export async function appendObject(sheetName: string, headers: readonly string[], item: Record<string, unknown>) {
  await appendValues(sheetName, [objectToRow(headers, item)]);
}

export async function updateObjectByKey(
  sheetName: string,
  headers: readonly string[],
  key: string,
  keyValue: string,
  patch: Record<string, unknown>,
) {
  const rows = await getValues(sheetName);
  const actualHeaders = rows[0] ?? [...headers];
  const keyIndex = actualHeaders.indexOf(key);
  if (keyIndex === -1) throw new Error(`В листе ${sheetName} не найдена колонка ${key}`);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[keyIndex] === keyValue);
  if (rowIndex === -1) throw new Error(`Запись ${keyValue} не найдена в листе ${sheetName}`);

  const existing: RowObject = {};
  actualHeaders.forEach((header, index) => {
    existing[header] = String(rows[rowIndex][index] ?? "");
  });
  const merged = { ...existing, ...patch };
  const values = actualHeaders.map((header) => {
    const value = merged[header];
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    return value === undefined || value === null ? "" : String(value);
  });

  await updateValues(
    sheetName,
    `A${rowIndex + 1}:${columnLetter(actualHeaders.length - 1)}${rowIndex + 1}`,
    [values],
  );
}
