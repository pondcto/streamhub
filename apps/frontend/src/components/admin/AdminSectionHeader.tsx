import type { ReactNode } from "react";

interface AdminSectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function AdminSectionHeader({ title, description, action }: AdminSectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
