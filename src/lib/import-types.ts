// Shape shared by every spreadsheet import (employees, assets) so one dialog can
// render the preview and the result.

export type ImportRowResult = {
  rowNumber: number;
  label: string;
  action: "create" | "update" | "error";
  errors: string[];
};

export type ImportSummary = {
  committed: boolean;
  total: number;
  creates: number;
  updates: number;
  errors: number;
  rows: ImportRowResult[];
};
