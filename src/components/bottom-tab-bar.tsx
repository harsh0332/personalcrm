"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Upload, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Today", href: "/", icon: Calendar },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Import", href: "/import", icon: Upload },
  { name: "Stats", href: "/stats", icon: BarChart3 },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center py-2 text-xs font-medium transition-colors min-h-[48px] min-w-[44px] touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                isActive
                  ? "text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
