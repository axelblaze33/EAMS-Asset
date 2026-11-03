// Shared (client-safe) report types. Definitions live in registry.ts (server-only).

export type ColumnKind = "text" | "mono" | "number" | "money" | "date" | "datetime" | "status";

export type ReportColumn<R> = {
  header: string;
  kind?: ColumnKind;
  /** Relative width, used for Excel column width and PDF layout. */
  width?: number;
  value: (row: R) => string | number | Date | null | undefined;
  /** Hide in the on-screen preview (still exported). */
  exportOnly?: boolean;
};

export type FilterKey = "from" | "to" | "department" | "category" | "status" | "employee" | "asset";

export type ReportFilters = {
  from?: Date;
  to?: Date;
  department?: string;
  category?: string;
  status?: string;
  employee?: string;
  asset?: string;
};

export type ReportSummary = { label: string; value: string }[];

export type ReportGroup = "Inventory" | "People" | "Activity" | "Finance";
