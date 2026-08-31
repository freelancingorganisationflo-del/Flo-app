import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Spinner } from "@/components/Spinner";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Dashboard } from "@/pages/Dashboard";
import { Chat } from "@/pages/Chat";
import { Tasks } from "@/pages/Tasks";
import { Memory } from "@/pages/Memory";
import { Documents } from "@/pages/Documents";
import { Settings } from "@/pages/Settings";
import { Placeholder } from "@/pages/Placeholder";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-navy">
        <Spinner />
      </div>
    );
  }
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          element={
            <>
              <ProtectedRoute />
              <AppLayout />
            </>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/tools" element={<Placeholder />} />
          <Route path="/automation" element={<Placeholder />} />
          <Route path="/calendar" element={<Placeholder />} />
          <Route path="/files" element={<Placeholder />} />
          <Route path="/analytics" element={<Placeholder />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
