/**
 * One-off: dump the live database (faculty / students / results / claims / PTM)
 * to prisma/data/cohort.json, which `npm run seed` reloads. Run this after
 * making real changes in the app (new proctors, students, results, ...) so the
 * committed snapshot stays in sync with what's actually in Supabase — this is
 * the primary way cohort.json gets regenerated now that the cohort spans
 * multiple proctors/semesters loaded through the app itself, not just the two
 * source spreadsheets buildCohort.ts was built around.
 *
 *   npm run seed:export
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/db";

async function main() {
  const [faculty, students, results, claims, ptm] = await Promise.all([
    prisma.faculty.findMany({ orderBy: { facultyId: "asc" } }),
    prisma.student.findMany({ orderBy: { usn: "asc" } }),
    prisma.resultRecord.findMany({ orderBy: [{ usn: "asc" }, { subjectCode: "asc" }] }),
    prisma.activityPointClaim.findMany(),
    prisma.ptmRecord.findMany(),
  ]);

  const out = {
    _generated: new Date().toISOString(),
    _note:
      "Real BMSCE CSE Cluster-A cohort snapshot (multiple proctors/semesters), dumped from the live Supabase database. Loaded by `npm run seed`. Contains real student PII — this repo must stay private.",
    faculty,
    students,
    results,
    claims,
    ptm,
  };

  const file = path.join(__dirname, "data", "cohort.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(
    `exported ${faculty.length} faculty, ${students.length} students, ${results.length} results, ` +
      `${claims.length} claims, ${ptm.length} ptm -> ${file}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
