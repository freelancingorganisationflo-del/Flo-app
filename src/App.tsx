import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { MemberLayout } from "@/components/layout/MemberLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PageSpinner } from "@/components/ui/Spinner";

import { Login } from "@/pages/auth/Login";
import { Signup } from "@/pages/auth/Signup";
import { Dashboard } from "@/pages/member/Dashboard";
import { Learning } from "@/pages/member/Learning";
import { ModuleDetail } from "@/pages/member/ModuleDetail";
import { Checkins } from "@/pages/member/Checkins";
import { Resources } from "@/pages/member/Resources";
import { Leaderboard } from "@/pages/member/Leaderboard";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminMembers } from "@/pages/admin/Members";
import { AdminCurriculum } from "@/pages/admin/Curriculum";
import { AdminSubmissions } from "@/pages/admin/Submissions";
import { AdminCheckins } from "@/pages/admin/Checkins";
import { AdminResources } from "@/pages/admin/Resources";
import { AdminLeaderboard } from "@/pages/admin/Leaderboard";

function RoleRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <PageSpinner />;
  return <Navigate to={profile.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route element={<ProtectedRoute requireRole="member"><MemberLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/learning" element={<Learning />} />
          <Route path="/learning/:moduleId" element={<ModuleDetail />} />
          <Route path="/checkins" element={<Checkins />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Route>

        <Route element={<ProtectedRoute requireRole="admin"><AdminLayout /></ProtectedRoute>}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/members" element={<AdminMembers />} />
          <Route path="/admin/curriculum" element={<AdminCurriculum />} />
          <Route path="/admin/submissions" element={<AdminSubmissions />} />
          <Route path="/admin/checkins" element={<AdminCheckins />} />
          <Route path="/admin/resources" element={<AdminResources />} />
          <Route path="/admin/leaderboard" element={<AdminLeaderboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
