import { Navigate, Route, Routes } from "react-router-dom";
import {
  LayoutDashboard,
  UploadCloud,
  TrendingUp,
  Users,
  AlertTriangle,
  GraduationCap,
  FileSpreadsheet,
  CalendarDays,
  Award,
  BookOpen,
  IdCard,
  ScanLine,
  Scale,
  BarChart3,
  History,
  CalendarCheck,
  Sparkles,
  MessageSquare,
  Megaphone,
} from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import Login from "./auth/Login";
import PortalLayout from "./layout/PortalLayout";

import AdminDashboard from "./portals/admin/AdminDashboard";
import UploadData from "./portals/admin/UploadData";
import PromoteCohort from "./portals/admin/PromoteCohort";
import ImportExceptions from "./portals/admin/ImportExceptions";
import AdminFaculty from "./portals/admin/AdminFaculty";
import AdminWorkload from "./portals/admin/AdminWorkload";
import AdminAnalytics from "./portals/admin/AdminAnalytics";
import AuditLog from "./portals/admin/AuditLog";
import AdminActivityPoints from "./portals/admin/AdminActivityPoints";

import ProctorDashboard from "./portals/proctor/ProctorDashboard";
import UploadResults from "./portals/proctor/UploadResults";
import Calendar from "./portals/proctor/Calendar";
import ActivityPointsReview from "./portals/proctor/ActivityPointsReview";
import AttendanceMark from "./portals/proctor/AttendanceMark";

import StudentDashboard from "./portals/student/StudentDashboard";
import AcademicRecord from "./portals/student/AcademicRecord";
import ActivityPointsStudent from "./portals/student/ActivityPointsStudent";
import MyInfo from "./portals/student/MyInfo";
import Accolades from "./portals/student/Accolades";

import Directory from "./portals/shared/Directory";
import StudentDetail from "./portals/shared/StudentDetail";
import FacultyDetail from "./portals/shared/FacultyDetail";
import ScanImport from "./portals/shared/ScanImport";
import AccoladesFeed from "./portals/shared/AccoladesFeed";
import PtmDocument from "./portals/shared/PtmDocument";
import Messages from "./portals/shared/Messages";
import Circulars from "./portals/shared/Circulars";
import MarkRequestsStudent from "./portals/student/MarkRequestsStudent";

const adminTabs = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/upload", label: "Upload", icon: UploadCloud },
  { to: "/admin/scan", label: "Scan Import", icon: ScanLine },
  { to: "/admin/promote", label: "Promote Cohort", icon: TrendingUp },
  { to: "/admin/directory", label: "Directory", icon: Users },
  { to: "/admin/exceptions", label: "Exceptions", icon: AlertTriangle },
  { to: "/admin/faculty", label: "Faculty", icon: GraduationCap },
  { to: "/admin/workload", label: "Workload", icon: Scale },
  { to: "/admin/activity-points", label: "Activity Points", icon: Award },
  { to: "/admin/accolades", label: "Accolades", icon: Sparkles },
  { to: "/admin/messages", label: "Messages", icon: MessageSquare },
  { to: "/admin/circulars", label: "Circulars", icon: Megaphone },
  { to: "/admin/audit-log", label: "Audit Log", icon: History },
];

const proctorTabs = [
  { to: "/proctor", label: "Dashboard", icon: LayoutDashboard },
  { to: "/proctor/directory", label: "Directory", icon: Users },
  { to: "/proctor/upload", label: "Upload Results", icon: FileSpreadsheet },
  { to: "/proctor/scan", label: "Scan Import", icon: ScanLine },
  { to: "/proctor/calendar", label: "Calendar / PTM", icon: CalendarDays },
  { to: "/proctor/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/proctor/activity-points", label: "Activity Points", icon: Award },
  { to: "/proctor/messages", label: "Messages", icon: MessageSquare },
  { to: "/proctor/circulars", label: "Circulars", icon: Megaphone },
  { to: "/proctor/accolades", label: "Accolades", icon: Sparkles },
];

const studentTabs = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/academic-record", label: "Academic Record", icon: BookOpen },
  { to: "/student/activity-points", label: "Activity Points", icon: Award },
  { to: "/student/mark-requests", label: "Re-Eval", icon: FileSpreadsheet },
  { to: "/student/accolades", label: "Accolades", icon: Sparkles },
  { to: "/student/my-info", label: "My Info", icon: IdCard },
];

function HomeRedirect() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role === "ADMIN") return <Navigate to="/admin" replace />;
  if (auth.role === "PROCTOR") return <Navigate to="/proctor" replace />;
  return <Navigate to="/student" replace />;
}

function RequireRole({ role, children }: { role: "ADMIN" | "PROCTOR" | "STUDENT"; children: JSX.Element }) {
  const { auth, loading } = useAuth();
  if (loading) return null;
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { auth, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={auth ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/ptm/:id" element={<PtmDocument />} />

      <Route
        path="/admin"
        element={
          <RequireRole role="ADMIN">
            <PortalLayout tabs={adminTabs} portalName="Admin Portal" />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="upload" element={<UploadData />} />
        <Route path="scan" element={<ScanImport base="/admin" />} />
        <Route path="promote" element={<PromoteCohort />} />
        <Route path="directory" element={<Directory role="ADMIN" />} />
        <Route path="exceptions" element={<ImportExceptions />} />
        <Route path="faculty" element={<AdminFaculty />} />
        <Route path="faculty/:id" element={<FacultyDetail base="/admin" />} />
        <Route path="students/:usn" element={<StudentDetail base="/admin" />} />
        <Route path="workload" element={<AdminWorkload />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="activity-points" element={<AdminActivityPoints />} />
        <Route path="accolades" element={<AccoladesFeed base="/admin" />} />
        <Route path="messages" element={<Messages />} />
        <Route path="circulars" element={<Circulars />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>

      <Route
        path="/proctor"
        element={
          <RequireRole role="PROCTOR">
            <PortalLayout tabs={proctorTabs} portalName="Proctor Portal" />
          </RequireRole>
        }
      >
        <Route index element={<ProctorDashboard />} />
        <Route path="directory" element={<Directory role="PROCTOR" />} />
        <Route path="upload" element={<UploadResults />} />
        <Route path="scan" element={<ScanImport base="/proctor" />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="attendance" element={<AttendanceMark />} />
        <Route path="activity-points" element={<ActivityPointsReview />} />
        <Route path="messages" element={<Messages />} />
        <Route path="circulars" element={<Circulars />} />
        <Route path="accolades" element={<AccoladesFeed base="/proctor" />} />
        <Route path="faculty/:id" element={<FacultyDetail base="/proctor" />} />
        <Route path="students/:usn" element={<StudentDetail base="/proctor" />} />
      </Route>

      <Route
        path="/student"
        element={
          <RequireRole role="STUDENT">
            <PortalLayout tabs={studentTabs} portalName="Student Portal" />
          </RequireRole>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="academic-record" element={<AcademicRecord />} />
        <Route path="activity-points" element={<ActivityPointsStudent />} />
        <Route path="mark-requests" element={<MarkRequestsStudent />} />
        <Route path="accolades" element={<Accolades />} />
        <Route path="my-info" element={<MyInfo />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
