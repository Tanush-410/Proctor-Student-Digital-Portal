-- Departmental clusters (A/B/C/D/E): each faculty member belongs to one, and
-- a student's cluster is inherited from their proctor.
-- AlterTable
ALTER TABLE "faculty" ADD COLUMN "cluster" TEXT;
