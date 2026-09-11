-- AlterTable
ALTER TABLE "mark_request" ADD COLUMN     "proctor_id" INTEGER;

-- CreateIndex
CREATE INDEX "mark_request_proctor_id_status_idx" ON "mark_request"("proctor_id", "status");

-- AddForeignKey
ALTER TABLE "mark_request" ADD CONSTRAINT "mark_request_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;
