-- AlterTable
ALTER TABLE "ptm_record" ADD COLUMN     "usn" TEXT;

-- CreateTable
CREATE TABLE "student_note" (
    "id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "author_id" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_note_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ptm_record" ADD CONSTRAINT "ptm_record_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;
