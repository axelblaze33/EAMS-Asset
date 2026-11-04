-- CreateEnum
CREATE TYPE "CredentialEvent" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateTable
CREATE TABLE "asset_credentials" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT,
    "secret" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "asset_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_credential_history" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "event" "CredentialEvent" NOT NULL,
    "username" TEXT,
    "secret" TEXT,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_credential_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_credentials_asset_id_idx" ON "asset_credentials"("asset_id");

-- CreateIndex
CREATE INDEX "asset_credential_history_credential_id_changed_at_idx" ON "asset_credential_history"("credential_id", "changed_at");

-- AddForeignKey
ALTER TABLE "asset_credentials" ADD CONSTRAINT "asset_credentials_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_credentials" ADD CONSTRAINT "asset_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_credentials" ADD CONSTRAINT "asset_credentials_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_credential_history" ADD CONSTRAINT "asset_credential_history_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "asset_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_credential_history" ADD CONSTRAINT "asset_credential_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
