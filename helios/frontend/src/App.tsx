import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Spinner } from "@/components/Spinner";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Chat } from "@/pages/Chat";
import { Tasks } from "@/pages/Tasks";
import { Memory } from "@/pages/Memory";
import { Documents } from "@/pages/Documents";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }
  return <Navigate to={user ? "/chat" : "/login"} replace />;
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
          <Route path="/chat" element={<Chat />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/documents" element={<Documents />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
