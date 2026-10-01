import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Spinner } from "@/components/Spinner";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Dashboard } from "@/pages/Dashboard";
import { Chat } from "@/pages/Chat";
import { Code } from "@/pages/Code";
import { Automation } from "@/pages/Automation";
import { Tasks } from "@/pages/Tasks";
import { Memory } from "@/pages/Memory";
import { Documents } from "@/pages/Documents";
import { Search } from "@/pages/Search";
import { Settings } from "@/pages/Settings";
import { Placeholder } from "@/pages/Placeholder";
import { Voice } from "@/pages/Voice";
import { Vision } from "@/pages/Vision";
import { InstallPrompt } from "@/components/InstallPrompt";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
        <div className="flex items-center justify-center h-[100dvh] bg-navy">
        <Spinner />
      </div>
    );
  }
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
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
          <Route path="/voice" element={<Voice />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/code" element={<Code />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/tools" element={<Placeholder />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/calendar" element={<Placeholder />} />
          <Route path="/files" element={<Placeholder />} />
          <Route path="/analytics" element={<Placeholder />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
