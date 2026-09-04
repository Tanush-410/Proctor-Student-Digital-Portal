-- CreateTable
CREATE TABLE "accolade" (
    "id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "proof_file" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accolade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accolade_usn_idx" ON "accolade"("usn");

-- AddForeignKey
ALTER TABLE "accolade" ADD CONSTRAINT "accolade_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;
