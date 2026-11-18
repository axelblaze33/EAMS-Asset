-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LICENSE_EXPIRY';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "license_key" TEXT,
ADD COLUMN "license_seats" INTEGER,
ADD COLUMN "license_expiry" DATE;

-- CreateIndex
CREATE INDEX "assets_license_expiry_idx" ON "assets"("license_expiry");

-- Categories for antivirus, network gear, CCTV and cabling. Skipped when a
-- category with the same name or code already exists.
INSERT INTO "asset_categories" ("id", "name", "code", "description", "useful_life_months", "salvage_percent", "updated_at")
VALUES
  (gen_random_uuid()::text, 'Antivirus', 'AV', 'Antivirus / endpoint security subscriptions', 12, 0, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LAN Switch', 'LSW', 'Network switches (non-PoE)', 60, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PoE Switch', 'POE', 'Power-over-Ethernet switches for cameras, APs and phones', 60, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CCTV Dome Camera', 'CCTV-D', 'Indoor / ceiling dome cameras', 60, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CCTV Bullet Camera', 'CCTV-B', 'Outdoor / wall-mounted bullet cameras', 60, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Cables', 'CBL', 'Network, power and video cables', 36, 0, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
