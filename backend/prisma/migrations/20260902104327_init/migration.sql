-- CreateTable
CREATE TABLE "faculty" (
    "faculty_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "staff_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "cabin_no" TEXT,
    "telecom_no" TEXT,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PROCTOR'
);

-- CreateTable
CREATE TABLE "student" (
    "usn" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "student_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty" ("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "result_record" (
    "result_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "result_record_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student" ("usn") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "result_record_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "faculty" ("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity_point_claim" (
    "claim_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usn" TEXT NOT NULL,
    "proctor_id" INTEGER,
    "proof_file" TEXT,
    "description" TEXT NOT NULL,
    "requested_points" INTEGER NOT NULL,
    "granted_points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" DATETIME,
    CONSTRAINT "activity_point_claim_usn_fkey" FOREIGN KEY ("usn") REFERENCES "student" ("usn") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "activity_point_claim_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty" ("faculty_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ptm_record" (
    "ptm_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "proctor_id" INTEGER NOT NULL,
    "ptm_date" TEXT NOT NULL,
    "ptm_time" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "ptm_record_proctor_id_fkey" FOREIGN KEY ("proctor_id") REFERENCES "faculty" ("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_batch" (
    "batch_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "import_batch_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "faculty" ("faculty_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_exception" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_exception_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch" ("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "otp_request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "session" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "faculty_id" INTEGER,
    "usn" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "faculty_short_code_key" ON "faculty"("short_code");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_email_key" ON "faculty"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_email_key" ON "student"("email");
