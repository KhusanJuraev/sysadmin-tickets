"use client";

import { useEffect, useMemo, useState } from "react";
import { REQUEST_TYPE_LABELS } from "@/config/app";
import { DICTIONARIES, getCategoriesByType, getSubcategories } from "@/config/dictionaries";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form-field";
import { apiFetch } from "@/components/app/client-api";
import { uploadFilesToSupabase } from "@/components/app/storage-upload";
import { normalizeUploadWarnings } from "@/lib/storage/attachments";
import type { AppUser, AttachmentMeta, MarketingRequest, RequestPayload, RequestType, TelegramUser } from "@/types";

const STEPS = ["Заявка", "Файлы", "Проверка"] as const;

type SubmissionPayload = Pick<
  RequestPayload,
  | "request_type"
  | "category"
  | "subcategory"
  | "quantity"
  | "unit"
  | "requirements"
  | "need_delivery"
  | "need_installation"
>;

const MATERIAL_CATEGORIES = getCategoriesByType("material");
const SERVICE_CATEGORIES = getCategoriesByType("service");

function inferTypeByCategory(category: string): RequestType {
  return SERVICE_CATEGORIES.includes(category) && !MATERIAL_CATEGORIES.includes(category) ? "service" : "material";
}

function defaultPayload(user: AppUser | null, telegramUser: TelegramUser | null): RequestPayload {
  const requestType: RequestType = "material";
  const category = MATERIAL_CATEGORIES[0];
  const subcategory = getSubcategories(requestType, category)[0];
  const officeLocation = user?.office_location || user?.branch || "";

  return {
    requester_fio: user?.fio || [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(" "),
    telegram_id: user?.telegram_id || String(telegramUser?.id ?? ""),
    telegram_username: user?.username || telegramUser?.username || "",
    phone: user?.phone || "",
    position: user?.position || "",
    department: user?.department || "",
    branch: officeLocation,
    city: officeLocation,
    request_type: requestType,
    category,
    subcategory,
    item_name: subcategory,
    description: "",
    quantity: "1",
    unit: DICTIONARIES.units[0],
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
}

function applyRegisteredProfile(
  payload: RequestPayload,
  user: AppUser | null,
  telegramUser: TelegramUser | null,
): RequestPayload {
  const officeLocation = user?.office_location || user?.branch || payload.branch;
  return {
    ...payload,
    requester_fio: user?.fio || payload.requester_fio,
    telegram_id: user?.telegram_id || String(telegramUser?.id ?? payload.telegram_id),
    telegram_username: user?.username || telegramUser?.username || payload.telegram_username,
    phone: user?.phone || payload.phone,
    position: user?.position || payload.position,
    department: user?.department || payload.department,
    branch: officeLocation,
    city: officeLocation || payload.city,
  };
}

function ReviewTile({ label, value, tone = "white" }: { label: string; value: string; tone?: "white" | "green" | "amber" }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-950"
      : tone === "amber"
        ? "bg-amber-50 text-amber-950"
        : "bg-white text-zinc-950";

  return (
    <div className={`rounded-xl p-3 shadow-[0_6px_16px_rgba(15,23,42,.035)] ${toneClass}`}>
      <p className="meta-label opacity-65">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5">{value || "Не указано"}</p>
    </div>
  );
}

function ToggleChip({
  active,
  tone,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  tone: "delivery" | "installation";
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring wizard-toggle-card wizard-toggle-${tone} ${
        active ? "wizard-toggle-active" : ""
      }`}
    >
      <span className="block text-sm font-bold">{label}</span>
      <span className="mt-1 block text-xs leading-5">{hint}</span>
    </button>
  );
}

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

export function RequestWizard({
  user,
  telegramUser,
  onCreated,
}: {
  user: AppUser | null;
  telegramUser: TelegramUser | null;
  onCreated: (request: MarketingRequest) => void;
}) {
  const storageKey = `mkt-request-draft-v2-${user?.telegram_id ?? telegramUser?.id ?? "guest"}`;
  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<RequestPayload>(() => defaultPayload(user, telegramUser));
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploadedAttachments, setUploadedAttachments] = useState<AttachmentMeta[]>([]);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [created, setCreated] = useState<MarketingRequest | null>(null);
  const [createdWarnings, setCreatedWarnings] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;

      try {
        setPayload((current) => applyRegisteredProfile({ ...current, ...JSON.parse(saved) }, user, telegramUser));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, telegramUser, user]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [payload, storageKey]);

  const subcategories = useMemo(
    () => getSubcategories(payload.request_type, payload.category),
    [payload.request_type, payload.category],
  );
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const selectedCategoryValue = `${payload.request_type}:${payload.category}`;
  const attachedFiles = Array.from(files ?? []);

  function update<K extends keyof RequestPayload>(key: K, value: RequestPayload[K]) {
    setPayload((current) => {
      const next = { ...current, [key]: value };

      if (key === "category") {
        const category = String(value);
        const type = inferTypeByCategory(category);
        next.request_type = type;
        next.category = category;
        next.subcategory = getSubcategories(type, category)[0];
        next.item_name = next.subcategory;
      }

      if (key === "subcategory") {
        next.item_name = String(value);
      }

      return next;
    });
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function validateRequestStep() {
    const nextErrors: Record<string, string> = {};
    if (!payload.category) nextErrors.category = "Выберите категорию";
    if (!payload.subcategory) nextErrors.subcategory = "Выберите подкатегорию";
    if (!payload.quantity || Number(payload.quantity) <= 0) nextErrors.quantity = "Укажите количество";
    if (!payload.unit) nextErrors.unit = "Выберите единицу";
    if (!payload.requirements.trim()) {
      nextErrors.requirements = "Опишите требование";
    } else if (payload.requirements.trim().length < 8) {
      nextErrors.requirements = "Добавьте чуть больше деталей";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateCurrentStep() {
    if (step === 0) return validateRequestStep();
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function submissionPayload(): SubmissionPayload {
    return {
      request_type: payload.request_type,
      category: payload.category,
      subcategory: payload.subcategory,
      quantity: payload.quantity,
      unit: payload.unit,
      requirements: payload.requirements.trim(),
      need_delivery: payload.need_delivery,
      need_installation: payload.need_installation,
    };
  }

  async function handleFileSelection(nextFiles: FileList | null) {
    setFiles(nextFiles);
    setUploadedAttachments([]);
    setUploadWarnings([]);

    const selected = Array.from(nextFiles ?? []);
    if (!selected.length) return;

    setUploading(true);
    try {
      const result = await uploadFilesToSupabase(selected);
      setUploadedAttachments(result.attachments);
      setUploadWarnings(normalizeUploadWarnings(result.warnings));
    } catch (error) {
      setUploadWarnings(
        normalizeUploadWarnings([
          error instanceof Error
            ? error.message
            : "Не удалось загрузить вложение. Вы можете отправить заявку без файла.",
        ]),
      );
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!validateRequestStep()) {
      setStep(0);
      return;
    }

    setSubmitting(true);
    setServerError("");
    try {
      const result = await apiFetch<{ request: MarketingRequest; warnings?: string[] }>("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: submissionPayload(),
          attachments: uploadedAttachments,
          uploadWarnings,
        }),
      });

      setCreated(result.request);
      setCreatedWarnings(normalizeUploadWarnings(result.warnings ?? []));
      window.localStorage.removeItem(storageKey);
      onCreated(result.request);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="hero-surface p-5 sm:p-6">
        <div className="relative z-10">
          <span className="meta-label inline-flex rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
            Заявка создана
          </span>
          <h2 className="screen-title mt-5 text-zinc-950">{created.request_id}</h2>
          <p className="body-copy mt-3 max-w-2xl">
            Заявка ушла в реестр и технический отдел получил уведомление. Статус и комментарии будут доступны в разделе
            “Мои заявки”.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ReviewTile label="Категория" value={created.category} />
            <ReviewTile label="Подкатегория" value={created.subcategory} />
            <ReviewTile label="Объект" value={`${created.quantity} ${created.unit}`} />
          </div>
        </div>

        {createdWarnings.length ? (
          <div className="soft-alert relative z-10 mt-5 p-4 text-sm leading-6">
            <p className="font-semibold">Заявка создана, но есть предупреждения</p>
            <ul className="mt-2 list-inside list-disc">
              {createdWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button
          className="relative z-10 mt-6 w-full sm:w-auto"
          onClick={() => {
            setCreated(null);
            setCreatedWarnings([]);
            setStep(0);
            setPayload(defaultPayload(user, telegramUser));
            setFiles(null);
            setUploadedAttachments([]);
            setUploadWarnings([]);
          }}
        >
          Создать еще заявку
        </Button>
      </section>
    );
  }

  return (
    <section className="premium-panel overflow-hidden">
      <div className="grid gap-5 border-b border-zinc-100 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Новая заявка</p>
            <h2 className="screen-title mt-2 text-zinc-950">Создание заявки в технический отдел</h2>
            <p className="body-copy mt-2 max-w-2xl">
              Создавайте заявки, отслеживайте статусы и держите всю коммуникацию с техническим отделом в одном месте.
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{progress}%</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => (index <= step ? setStep(index) : undefined)}
              className={`focus-ring min-h-11 rounded-xl px-2 text-[12px] font-semibold transition duration-200 ${
                index === step
                  ? "bg-emerald-600 text-white shadow-[0_8px_20px_rgba(5,150,105,.16)]"
                  : index < step
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-white text-zinc-400 shadow-[0_6px_16px_rgba(15,23,42,.035)]"
              }`}
            >
              <span className="block">{index + 1}. {label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        {step === 0 ? (
          <div className="grid gap-5">
            <div className="wizard-profile-card">
              <p className="meta-label text-emerald-700">Заявитель</p>
              <h3 className="section-title mt-2 text-zinc-950">{payload.requester_fio || "Профиль сотрудника"}</h3>
              <p className="body-copy mt-1 text-zinc-600">
                {payload.department || "Отдел"} · {payload.branch || "Филиал"} · {payload.phone || "телефон из профиля"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Категория" error={errors.category}>
                <SelectInput
                  value={selectedCategoryValue}
                  onChange={(event) => {
                    const [type, category] = event.target.value.split(":") as [RequestType, string];
                    setPayload((current) => {
                      const subcategory = getSubcategories(type, category)[0];
                      return {
                        ...current,
                        request_type: type,
                        category,
                        subcategory,
                        item_name: subcategory,
                      };
                    });
                    setErrors((current) => ({ ...current, category: "", subcategory: "" }));
                  }}
                >

                  <optgroup label="Услуги">
                    {SERVICE_CATEGORIES.map((category) => (
                      <option key={`service:${category}`} value={`service:${category}`}>
                        {category}
                      </option>
                    ))}
                  </optgroup>
                </SelectInput>
              </Field>

              <Field label="Подкатегория" error={errors.subcategory}>
                <SelectInput value={payload.subcategory} onChange={(event) => update("subcategory", event.target.value)}>
                  {subcategories.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>
                      {subcategory}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              {/*<Field label="Количество" error={errors.quantity}>*/}
              {/*  <TextInput*/}
              {/*    type="number"*/}
              {/*    min="1"*/}
              {/*    inputMode="numeric"*/}
              {/*    value={payload.quantity}*/}
              {/*    onChange={(event) => update("quantity", event.target.value)}*/}
              {/*  />*/}
              {/*</Field>*/}

              <Field label="Объект / Локация" error={errors.unit}>
                <SelectInput value={payload.unit} onChange={(event) => update("unit", event.target.value)}>
                  {DICTIONARIES.units.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <div className={`wizard-requirement-card ${errors.requirements ? "wizard-requirement-card-error" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold leading-5 text-zinc-900">Требование</h3>
                <p className="meta-text font-semibold text-emerald-700">{payload.requirements.trim().length} символов</p>
              </div>
              <TextArea
                value={payload.requirements}
                onChange={(event) => update("requirements", event.target.value)}
                placeholder="Кратко опишите проблему или что нужно сделать"
                className="wizard-requirement-textarea mt-3"
              />
              <p className="meta-text mt-3 text-zinc-500">
                Одного короткого описания достаточно. Детали технический отдел уточнит в работе.
              </p>
              {errors.requirements ? <p className="mt-2 text-sm font-semibold text-rose-600">{errors.requirements}</p> : null}
            </div>


          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4">
            <div className="wizard-upload-card p-5 text-center">
              <p className="text-sm font-bold text-zinc-950">Вложения необязательны</p>
              <p className="body-copy mx-auto mt-1 max-w-md">
                Можно приложить фото, видео или документ. Если файловое хранилище временно недоступно, заявка все равно
                будет создана.
              </p>
              <label className="wizard-file-picker mt-5">
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.mov"
                  onChange={(event) => void handleFileSelection(event.target.files)}
                />
                <span className="wizard-file-picker-button">Выбрать файлы</span>
                <span className="wizard-file-picker-text">
                  {uploading
                    ? "Загрузка..."
                    : uploadedAttachments.length
                      ? `${uploadedAttachments.length} файл(ов) загружено`
                      : attachedFiles.length
                        ? `${attachedFiles.length} файл(ов) выбрано`
                        : "Файл не выбран"}
                </span>
              </label>
            </div>

            {attachedFiles.length ? (
              <div className="grid gap-2">
                {attachedFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="file-row"
                  >
                    <span className="file-row-icon">Ф</span>
                    <span className="min-w-0 flex-1">
                      <span className="file-row-name">{file.name}</span>
                    </span>
                    <span className="file-row-size">{fileSizeLabel(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wizard-empty-file-note body-copy p-4">
                Файл можно не прикреплять. Для большинства заявок достаточно требования.
              </p>
            )}

            {uploading ? (
              <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-700 shadow-[0_6px_16px_rgba(5,150,105,.06)]">
                Загружаем вложение в хранилище...
              </p>
            ) : null}

            {uploadWarnings.length ? (
              <div className="soft-alert p-4 text-sm leading-6">
                <p className="font-semibold">Вложение не помешает отправке заявки</p>
                <ul className="mt-2 list-inside list-disc">
                  {uploadWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div className="rounded-xl bg-zinc-50/80 p-4 shadow-[0_6px_16px_rgba(15,23,42,.035)]">
              <p className="meta-label text-emerald-700">Проверка перед отправкой</p>
              <h3 className="section-title mt-2 text-zinc-950">{payload.subcategory || payload.category}</h3>
              <p className="body-copy mt-2 text-zinc-700">{payload.requirements || "Требование не заполнено."}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ReviewTile label="Тип" value={REQUEST_TYPE_LABELS[payload.request_type]} />
                <ReviewTile label="Категория" value={payload.category} />
                <ReviewTile label="Подкатегория" value={payload.subcategory} />
                <ReviewTile label="Объект" value={`${payload.quantity} ${payload.unit}`} />
                <ReviewTile label="Доставка" value={payload.need_delivery ? "Нужна" : "Не нужна"} tone={payload.need_delivery ? "green" : "white"} />
                <ReviewTile label="Монтаж" value={payload.need_installation ? "Нужен" : "Не нужен"} tone={payload.need_installation ? "amber" : "white"} />
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-[0_6px_16px_rgba(15,23,42,.035)]">
              <p className="meta-label text-zinc-400">Вложения</p>
              {uploadedAttachments.length ? (
                <div className="mt-3 grid gap-2">
                  {uploadedAttachments.map((file) => (
                    <div key={`${file.storagePath ?? file.name}-${file.size}`} className="file-row file-row-compact">
                      <span className="file-row-icon">Ф</span>
                      <span className="min-w-0 flex-1">
                        <span className="file-row-name">{file.name}</span>
                      </span>
                      <span className="file-row-size">{fileSizeLabel(file.size)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="body-copy mt-2">
                  {attachedFiles.length
                    ? "Файлы выбраны, но не загружены. Заявку можно отправить без вложений."
                    : "Файлы не прикреплены."}
                </p>
              )}
            </div>

            {uploadWarnings.length ? (
              <div className="soft-alert p-4 text-sm leading-6">
                <p className="font-semibold">Предупреждение по вложениям</p>
                <ul className="mt-2 list-inside list-disc">
                  {uploadWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="body-copy">
              После отправки заявка попадет в реестр, технический отдел получит уведомление и сможет назначить статус,
              комментарий и дальнейшие действия.
            </p>
          </div>
        ) : null}

        {serverError ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{serverError}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 p-5 sm:p-6">
        <Button variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || submitting}>
          Назад
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext} disabled={uploading}>
            {uploading ? "Загрузка..." : "Далее"}
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Отправка..." : "Отправить заявку"}
          </Button>
        )}
      </div>
    </section>
  );
}
