-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_request" (
    "id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "subject_code" TEXT NOT NULL,
    "subject_name" TEXT,
    "semester" INTEGER NOT NULL,
    "request_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposed_total" INTEGER,
    "proposed_grade" TEXT,
    "proof_file" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "reviewed_by" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "mark_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circular" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "sender_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circular_recipient" (
    "id" SERIAL NOT NULL,
    "circular_id" INTEGER NOT NULL,
    "faculty_id" INTEGER NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "circular_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_sender_id_recipient_id_idx" ON "message"("sender_id", "recipient_id");

-- CreateIndex
CREATE INDEX "message_recipient_id_read_idx" ON "message"("recipient_id", "read");

-- CreateIndex
CREATE INDEX "mark_request_usn_idx" ON "mark_request"("usn");

-- CreateIndex
CREATE UNIQUE INDEX "circular_recipient_circular_id_faculty_id_key" ON "circular_recipient"("circular_id", "faculty_id");

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_request" ADD CONSTRAINT "mark_request_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_request" ADD CONSTRAINT "mark_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circular" ADD CONSTRAINT "circular_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circular_recipient" ADD CONSTRAINT "circular_recipient_circular_id_fkey" FOREIGN KEY ("circular_id") REFERENCES "circular"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circular_recipient" ADD CONSTRAINT "circular_recipient_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;
