import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageSpinner } from "@/components/ui/Spinner";
import type { Role } from "@/lib/types/database.types";

export function ProtectedRoute({ children, requireRole }: { children: ReactNode; requireRole?: Role }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  // Profile missing means the DB trigger hasn't run or schema isn't applied yet.
  // Redirect to login so the user isn't stuck on an infinite spinner.
  if (!profile) return <Navigate to="/login" replace />;
  if (requireRole && profile.role !== requireRole) {
    return <Navigate to={profile.role === "admin" ? "/admin" : "/dashboard"} replace />;
  }
  return <>{children}</>;
}
