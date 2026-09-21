-- Faculty chat: allow sending a file/image (with or without caption text).
-- AlterTable
ALTER TABLE "message" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "message" ADD COLUMN "attachment_url" TEXT;
ALTER TABLE "message" ADD COLUMN "attachment_name" TEXT;
ALTER TABLE "message" ADD COLUMN "attachment_type" TEXT;
ALTER TABLE "message" ADD COLUMN "attachment_size" INTEGER;
