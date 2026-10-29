-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_isDemo_idx" ON "users"("isDemo");
