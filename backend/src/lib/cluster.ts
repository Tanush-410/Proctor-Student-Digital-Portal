import { prisma } from "../db";

export const CLUSTERS = ["A", "B", "C", "D", "E"] as const;
export type ClusterCode = (typeof CLUSTERS)[number];

/** The calling ADMIN's own cluster, or null if they aren't tagged into one yet. */
export async function callerCluster(facultyId: number | null): Promise<string | null> {
  if (!facultyId) return null;
  const faculty = await prisma.faculty.findUnique({ where: { facultyId }, select: { cluster: true } });
  return faculty?.cluster ?? null;
}
