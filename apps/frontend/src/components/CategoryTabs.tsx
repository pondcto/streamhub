"use client";

import Tabs, { type TabItem } from "@/components/ui/Tabs";
import type { DashboardSection } from "@/lib/types";

const TABS: TabItem<DashboardSection>[] = [
  {
    id: "live",
    label: "Live TV",
    icon: <span className="inline-flex h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />,
  },
  {
    id: "shows",
    label: "TV Shows",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Z" />
      </svg>
    ),
  },
];

interface CategoryTabsProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export default function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <Tabs
      items={TABS}
      active={active}
      onChange={onChange}
      layoutId="category-tabs"
      aria-label="Content category"
    />
  );
}
