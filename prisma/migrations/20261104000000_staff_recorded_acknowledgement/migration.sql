-- CreateEnum
CREATE TYPE "AcknowledgementMethod" AS ENUM ('SIGNED_FORM', 'EMAIL', 'IN_PERSON', 'OTHER');

-- AlterTable
ALTER TABLE "asset_assignments" ADD COLUMN     "acknowledged_by_id" TEXT,
ADD COLUMN     "acknowledgement_method" "AcknowledgementMethod",
ADD COLUMN     "acknowledgement_note" TEXT;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
