"use client";

import type { DashboardSection } from "@/lib/types";

const TABS: { id: DashboardSection; label: string }[] = [{ id: "test", label: "Test" }];

interface CategoryTabsProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export default function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" aria-label="Categories">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.id
              ? "bg-accent text-white"
              : "bg-surface-overlay text-gray-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
