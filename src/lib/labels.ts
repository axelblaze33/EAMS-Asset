// Display labels and badge tones for database enums, shared by every module.

export type Tone = "neutral" | "success" | "info" | "warning" | "danger" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

type EnumMeta = Record<string, { label: string; tone: Tone }>;

export const ASSET_STATUS = {
  AVAILABLE: { label: "Available", tone: "success" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  UNDER_MAINTENANCE: { label: "Under Maintenance", tone: "warning" },
  DAMAGED: { label: "Damaged", tone: "danger" },
  LOST: { label: "Lost", tone: "danger" },
  RETIRED: { label: "Retired", tone: "muted" },
  DISPOSED: { label: "Disposed", tone: "muted" },
} satisfies EnumMeta;

export const ASSET_CONDITION = {
  NEW: { label: "New", tone: "success" },
  EXCELLENT: { label: "Excellent", tone: "success" },
  GOOD: { label: "Good", tone: "info" },
  FAIR: { label: "Fair", tone: "warning" },
  POOR: { label: "Poor", tone: "danger" },
  DAMAGED: { label: "Damaged", tone: "danger" },
} satisfies EnumMeta;

export const ACKNOWLEDGEMENT = {
  PENDING: { label: "Not acknowledged", tone: "warning" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "success" },
} satisfies EnumMeta;

export const ACKNOWLEDGEMENT_METHOD = {
  SIGNED_FORM: { label: "Signed handover form", tone: "neutral" },
  EMAIL: { label: "Email confirmation", tone: "neutral" },
  IN_PERSON: { label: "Confirmed in person", tone: "neutral" },
  OTHER: { label: "Other", tone: "neutral" },
} satisfies EnumMeta;

export const EMPLOYMENT_STATUS = {
  ACTIVE: { label: "Active", tone: "success" },
  ON_NOTICE: { label: "On Notice", tone: "warning" },
  ON_LEAVE: { label: "On Leave", tone: "info" },
  EXITED: { label: "Exited", tone: "muted" },
} satisfies EnumMeta;

export const REQUEST_STATUS = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "info" },
  REJECTED: { label: "Rejected", tone: "danger" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
} satisfies EnumMeta;

export const MAINTENANCE_STATUS = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  PENDING_PARTS: { label: "Pending Parts", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
} satisfies EnumMeta;

export const CLEARANCE_STATUS = {
  INITIATED: { label: "Initiated", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
} satisfies EnumMeta;

export const CLEARANCE_ITEM = {
  PENDING: { label: "Pending", tone: "warning" },
  RETURNED: { label: "Returned", tone: "success" },
  DAMAGED: { label: "Returned damaged", tone: "danger" },
  MISSING: { label: "Missing", tone: "danger" },
  WAIVED: { label: "Written off", tone: "muted" },
} satisfies EnumMeta;

export const PRIORITY = {
  LOW: { label: "Low", tone: "muted" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
} satisfies EnumMeta;

export const REQUEST_TYPE = {
  NEW_ASSET: { label: "New asset", tone: "neutral" },
  REPLACEMENT: { label: "Replacement", tone: "neutral" },
} satisfies EnumMeta;

export const DOCUMENT_TYPE = {
  ASSET_IMAGE: { label: "Image", tone: "neutral" },
  INVOICE: { label: "Invoice", tone: "neutral" },
  HANDOVER: { label: "Handover", tone: "neutral" },
  RETURN_PHOTO: { label: "Return photo", tone: "neutral" },
  MAINTENANCE_INVOICE: { label: "Repair invoice", tone: "neutral" },
  OTHER: { label: "Other", tone: "neutral" },
} satisfies EnumMeta;

export function enumLabel(meta: EnumMeta, value: string) {
  return meta[value]?.label ?? value;
}
