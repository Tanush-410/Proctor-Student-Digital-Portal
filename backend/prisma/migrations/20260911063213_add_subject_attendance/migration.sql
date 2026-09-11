-- CreateTable
CREATE TABLE "subject_attendance" (
    "id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "subject_code" TEXT NOT NULL,
    "subject_name" TEXT,
    "semester" INTEGER NOT NULL,
    "total_classes" INTEGER NOT NULL,
    "attended_classes" INTEGER NOT NULL,
    "uploaded_by" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subject_attendance_usn_idx" ON "subject_attendance"("usn");

-- CreateIndex
CREATE UNIQUE INDEX "subject_attendance_usn_subject_code_semester_key" ON "subject_attendance"("usn", "subject_code", "semester");

-- AddForeignKey
ALTER TABLE "subject_attendance" ADD CONSTRAINT "subject_attendance_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_attendance" ADD CONSTRAINT "subject_attendance_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;
