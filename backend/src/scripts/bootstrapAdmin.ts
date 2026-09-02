/**
 * Creates (or promotes) the first Admin account on a fresh production
 * database. OTP login only works for an e-mail that already has a Faculty/
 * Student row — a brand-new deployment has none, so there is otherwise no
 * way to log in at all. Idempotent: safe to re-run.
 *
 * Usage: BOOTSTRAP_ADMIN_EMAIL=hod@college.edu BOOTSTRAP_ADMIN_NAME="Dr. HOD" \
 *        BOOTSTRAP_ADMIN_SHORT_CODE=HOD node dist/scripts/bootstrapAdmin.js
 */
import { prisma } from "../db";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const shortCode = process.env.BOOTSTRAP_ADMIN_SHORT_CODE?.trim();
  const staffId = process.env.BOOTSTRAP_ADMIN_STAFF_ID?.trim() || "ADMIN001";

  if (!email || !name || !shortCode) {
    console.error(
      "Missing required env vars. Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_SHORT_CODE (BOOTSTRAP_ADMIN_STAFF_ID optional)."
    );
    process.exit(1);
  }

  const existing = await prisma.faculty.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "ADMIN") {
      await prisma.faculty.update({ where: { email }, data: { role: "ADMIN" } });
      console.log(`Promoted existing faculty ${email} to ADMIN.`);
    } else {
      console.log(`${email} is already an ADMIN — nothing to do.`);
    }
    return;
  }

  await prisma.faculty.create({
    data: { staffId, name, shortCode, email, role: "ADMIN" },
  });
  console.log(`Created ADMIN account for ${email}. They can now log in via OTP.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
