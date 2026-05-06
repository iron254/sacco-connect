import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";

export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const { isAdmin, checking } = useAdmin();
  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
