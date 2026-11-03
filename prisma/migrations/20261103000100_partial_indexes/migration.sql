-- Integrity rules Prisma's schema language cannot express.

-- An asset can have at most one ACTIVE assignment. Concurrent double-assignment
-- fails here even if two requests pass application-level checks at the same time.
CREATE UNIQUE INDEX "asset_assignments_one_active_per_asset"
  ON "asset_assignments" ("asset_id")
  WHERE "status" = 'ACTIVE';

-- An employee can have at most one open exit clearance.
CREATE UNIQUE INDEX "employee_exit_clearance_one_open_per_employee"
  ON "employee_exit_clearance" ("employee_id")
  WHERE "status" IN ('INITIATED', 'IN_PROGRESS');

-- Money and cost values can never be negative.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_purchase_cost_non_negative" CHECK ("purchase_cost" IS NULL OR "purchase_cost" >= 0);
ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_cost_non_negative" CHECK ("cost" IS NULL OR "cost" >= 0);
ALTER TABLE "asset_returns"
  ADD CONSTRAINT "asset_returns_deduction_non_negative" CHECK ("deduction_amount" IS NULL OR "deduction_amount" >= 0);

-- Warranty cannot end before it starts; expected return cannot precede assignment.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_warranty_range" CHECK ("warranty_start" IS NULL OR "warranty_expiry" IS NULL OR "warranty_expiry" >= "warranty_start");
ALTER TABLE "asset_assignments"
  ADD CONSTRAINT "asset_assignments_return_after_assign" CHECK ("expected_return_at" IS NULL OR "expected_return_at" >= "assigned_at");
