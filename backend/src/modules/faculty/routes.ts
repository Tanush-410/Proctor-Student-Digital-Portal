import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const facultyRouter = safeRouter();

// GET /proctors — list/search the faculty directory.
// A Student session only ever sees their own proctor's entry (Section 9).
facultyRouter.get("/proctors", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  if (req.auth!.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { usn: req.auth!.usn! }, include: { proctor: true } });
    return res.json(student?.proctor ? [student.proctor] : []);
  }

  const q = (req.query.q as string | undefined)?.trim();
  const faculty = await prisma.faculty.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { shortCode: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });
  res.json(faculty);
});

// GET /proctors/count — total count for the Admin dashboard stat tile.
facultyRouter.get("/proctors/count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (_req: AuthedRequest, res) => {
  const count = await prisma.faculty.count();
  res.json({ count });
});

// GET /proctors/:id/students — list a proctor's proctees.
facultyRouter.get("/proctors/:id/students", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.auth!.role === "PROCTOR" && req.auth!.facultyId !== id) {
    return res.status(403).json({ error: "Proctors may only list their own proctees" });
  }
  const students = await prisma.student.findMany({ where: { proctorId: id }, orderBy: { usn: "asc" } });
  res.json(students);
});

// E-mail is normalised to lower-case here so it always matches the lookup in
// POST /auth/otp/request, which lowercases the caller's input before querying
// (Section 9: identity resolution has to be consistent or logins silently break).
const facultySchema = z.object({
  staffId: z.string().min(1),
  name: z.string().min(1),
  shortCode: z.string().min(1).max(10),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  role: z.enum(["ADMIN", "PROCTOR"]),
  cabinNo: z.string().optional(),
  telecomNo: z.string().optional(),
  phone: z.string().optional(),
});

// POST /faculty — onboard a new proctor/HOD. Not in the original design doc's
// use-case diagrams (faculty accounts were assumed pre-existing), but an Admin
// portal with no way to add a proctor can't actually be operated day to day.
facultyRouter.post("/faculty", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = facultySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const faculty = await prisma.faculty.create({ data: parsed.data });
    res.status(201).json(faculty);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Short code or e-mail already in use" });
    }
    throw err;
  }
});

const facultyUpdateSchema = facultySchema.partial();

// PATCH /faculty/:id — edit an existing faculty record.
facultyRouter.patch("/faculty/:id", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = facultyUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const faculty = await prisma.faculty.update({ where: { facultyId: id }, data: parsed.data });
    res.json(faculty);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return res.status(409).json({ error: "Short code or e-mail already in use" });
      if (err.code === "P2025") return res.status(404).json({ error: "Faculty not found" });
    }
    throw err;
  }
});

// GET /directory/search?q= — searchDirectory: matches short code, faculty name, student name, or USN.
// Capped at 25 results per side — this is a quick-lookup tool, not a browse-all
// view, and a broad query (a single common letter) could otherwise match
// hundreds of the 3000 students and ship them all in one response.
const DIRECTORY_SEARCH_LIMIT = 25;
facultyRouter.get("/directory/search", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";
  if (!q) return res.json({ faculty: [], students: [] });

  const [faculty, students] = await Promise.all([
    prisma.faculty.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { shortCode: { contains: q, mode: "insensitive" } }] },
      take: DIRECTORY_SEARCH_LIMIT,
    }),
    prisma.student.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { usn: { contains: q, mode: "insensitive" } }] },
      take: DIRECTORY_SEARCH_LIMIT,
    }),
  ]);
  res.json({ faculty, students });
});
