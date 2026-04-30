export type UserRole = "employee" | "marketing" | "marketing_head";

export type RegistrationStatus = "new" | "completed";

export type OnboardingStep =
  | "new"
  | "collecting_fio"
  | "collecting_phone"
  | "collecting_location"
  | "collecting_position"
  | "collecting_department"
  | "collecting_office"
  | "completed";

export type RequestType = "material" | "service";

export type RequestStatus =
  | "new"
  | "accepted"
  | "in_review"
  | "need_clarification"
  | "clarification_received"
  | "on_approval"
  | "approved"
  | "rejected"
  | "on_purchase"
  | "in_production"
  | "ready_to_send"
  | "sent"
  | "received"
  | "completed"
  | "closed";

export type NeedPurchase = "yes" | "no" | "marketing_decides";

export type AttachmentMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  storagePath?: string;
  publicUrl?: string;
  bucket?: string;
  type: "image" | "video" | "document" | "unknown";
};

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type AppUser = {
  telegram_id: string;
  username: string;
  telegram_first_name: string;
  telegram_last_name: string;
  fio: string;
  phone: string;
  position: string;
  department: string;
  branch: string;
  office_location: string;
  geo_lat: string;
  geo_lng: string;
  registration_status: RegistrationStatus;
  onboarding_step: OnboardingStep;
  created_at: string;
  updated_at: string;
  role: UserRole;
  is_active: boolean;
};

export type RequestPayload = {
  requester_fio: string;
  telegram_id: string;
  telegram_username: string;
  phone: string;
  position: string;
  department: string;
  branch: string;
  city: string;
  request_type: RequestType;
  category: string;
  subcategory: string;
  item_name: string;
  description: string;
  quantity: string;
  unit: string;
  purpose: string;
  justification: string;
  requirements: string;
  urgency: string;
  needed_date: string;
  delivery_address: string;
  receiver_name: string;
  receiver_contact: string;
  need_delivery: boolean;
  need_installation: boolean;
  need_purchase: NeedPurchase;
  related_object: string;
};

export type MarketingRequest = RequestPayload & {
  request_id: string;
  created_at: string;
  created_date: string;
  attachments_folder_url: string;
  attachments_list_json: string;
  attachments_urls: string;
  drive_folder_url: string;
  upload_warnings: string;
  current_status: RequestStatus;
  current_status_label: string;
  marketing_comment: string;
  assigned_marketing_user: string;
  purchase_required: string;
  purchase_request_no: string;
  sent_at: string;
  completed_at: string;
  closed_at: string;
  last_updated_at: string;
};

export type StatusHistoryEntry = {
  request_id: string;
  changed_at: string;
  changed_by: string;
  changed_by_role: UserRole | "system";
  old_status: string;
  new_status: RequestStatus;
  comment: string;
  requester_telegram_id: string;
  notification_sent: string;
  notification_sent_at: string;
  notification_text: string;
};

export type AuthContext = {
  telegramUser: TelegramUser;
  appUser: AppUser;
  initData: string;
  isDevAuth: boolean;
};
