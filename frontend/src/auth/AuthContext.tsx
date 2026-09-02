import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";

export type Role = "ADMIN" | "PROCTOR" | "STUDENT";

export interface FacultyProfile {
  facultyId: number;
  staffId: string;
  name: string;
  shortCode: string;
  cabinNo: string | null;
  telecomNo: string | null;
  phone: string | null;
  email: string;
  role: Role;
}

export interface StudentProfile {
  usn: string;
  name: string;
  section: string | null;
  admissionYear: number;
  currentSemester: number;
  proctorId: number | null;
  quota: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  localAddress: string | null;
  localGuardianName: string | null;
  localGuardianPhone: string | null;
  email: string;
}

export type Profile = FacultyProfile | StudentProfile;

interface AuthState {
  role: Role;
  profile: Profile;
}

interface AuthContextValue {
  auth: AuthState | null;
  loading: boolean;
  requestOtp: (email: string) => Promise<{ devOtp?: string }>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  // The session lives in an httpOnly cookie this JS can't read — so on load,
  // the only way to know "am I signed in, and as whom" is to ask the server.
  // A 401 here just means "not signed in", not an error to report.
  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => setAuth({ role: res.role, profile: res.profile }))
      .catch(() => setAuth(null))
      .finally(() => setLoading(false));
  }, []);

  async function requestOtp(email: string) {
    return api.post("/auth/otp/request", { email });
  }

  async function verifyOtp(email: string, code: string) {
    const res = await api.post("/auth/otp/verify", { email, code });
    setAuth({ role: res.role, profile: res.profile });
  }

  function logout() {
    api.post("/auth/logout").catch(() => {});
    setAuth(null);
  }

  return <AuthContext.Provider value={{ auth, loading, requestOtp, verifyOtp, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
