-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "source_file" TEXT;

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_record_usn_idx" ON "attendance_record"("usn");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_usn_date_key" ON "attendance_record"("usn", "date");

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;
