-- CreateTable
CREATE TABLE "faculty" (
    "faculty_id" SERIAL NOT NULL,
    "staff_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "cabin_no" TEXT,
    "telecom_no" TEXT,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PROCTOR',

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("faculty_id")
);

-- CreateTable
CREATE TABLE "student" (
    "usn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "admission_year" INTEGER NOT NULL,
    "current_semester" INTEGER NOT NULL DEFAULT 1,
    "proctor_id" INTEGER,
    "quota" TEXT,
    "father_name" TEXT,
    "father_phone" TEXT,
    "mother_name" TEXT,
    "mother_phone" TEXT,
    "local_address" TEXT,
    "local_guardian_name" TEXT,
    "local_guardian_phone" TEXT,
    "email" TEXT NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("usn")
);

-- CreateTable
CREATE TABLE "result_record" (
    "result_id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "subject_code" TEXT NOT NULL,
    "subject_name" TEXT,
    "semester" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "internal_marks" INTEGER,
    "external_marks" INTEGER,
    "total_marks" INTEGER,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "grade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PASS',
    "proof_file" TEXT,
    "uploaded_by" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_record_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "activity_point_claim" (
    "claim_id" SERIAL NOT NULL,
    "usn" TEXT NOT NULL,
    "proctor_id" INTEGER,
    "proof_file" TEXT,
    "description" TEXT NOT NULL,
    "requested_points" INTEGER NOT NULL,
    "granted_points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "activity_point_claim_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "ptm_record" (
    "ptm_id" SERIAL NOT NULL,
    "proctor_id" INTEGER NOT NULL,
    "ptm_date" TEXT NOT NULL,
    "ptm_time" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ptm_record_pkey" PRIMARY KEY ("ptm_id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "batch_id" SERIAL NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "import_exception" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_request" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "faculty_id" INTEGER,
    "usn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "faculty_short_code_key" ON "faculty"("short_code");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_email_key" ON "faculty"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_email_key" ON "student"("email");

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_record" ADD CONSTRAINT "result_record_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_record" ADD CONSTRAINT "result_record_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_point_claim" ADD CONSTRAINT "activity_point_claim_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student"("usn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_point_claim" ADD CONSTRAINT "activity_point_claim_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty"("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_record" ADD CONSTRAINT "ptm_record_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "faculty"("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_exception" ADD CONSTRAINT "import_exception_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
