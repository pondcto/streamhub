"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import LoadingGrid from "@/components/LoadingGrid";
import { useAuth } from "@/lib/auth";

interface RequireAuthProps {
  children: React.ReactNode;
  admin?: boolean;
}

/**
 * Client-side route guard. Redirects unauthenticated users to /login, and
 * non-admins away from admin-only pages. Renders a loading state until auth
 * is resolved.
 */
export default function RequireAuth({ children, admin = false }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const denied = !user || (admin && user.role !== "admin");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (admin && user.role !== "admin") {
      router.replace("/");
    }
  }, [loading, user, admin, router]);

  if (loading || denied) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <LoadingGrid count={4} />
      </div>
    );
  }

  return <>{children}</>;
}
