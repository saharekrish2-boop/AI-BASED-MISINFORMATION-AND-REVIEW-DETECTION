import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Newspaper,
  Star,
  History,
  BarChart3,
  BrainCircuit,
  Settings as SettingsIcon,
  X,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { getHealth } from "@/services/api";
import type { Health } from "@/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/news", label: "News Detector", icon: Newspaper },
  { to: "/reviews", label: "Review Detector", icon: Star },
  { to: "/history", label: "Analysis History", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/models", label: "Model Information", icon: BrainCircuit },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-gradient-to-r from-violet-600/20 to-cyan-500/10 text-foreground shadow-[inset_2px_0_0_0_theme(colors.violet.500)]"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  isActive ? "text-violet-400" : "text-muted-foreground group-hover:text-foreground"
                )}
                aria-hidden="true"
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getHealth()
        .then((h) => !cancelled && setHealth(h))
        .catch(() => !cancelled && setHealth(null));
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const online = health?.analysis_engine ?? false;
  return (
    <div className="border-t border-border/70 p-4">
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <span className="relative flex h-2.5 w-2.5">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              online ? "bg-emerald-400" : "bg-rose-500"
            )}
          />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-xs font-semibold text-foreground">
            {online ? "AI Engine Online" : "AI Engine Offline"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {health ? `v${health.version} · ${health.status}` : "API unreachable"}
          </p>
        </div>
        <ShieldCheck
          className={cn("ml-auto h-4 w-4", online ? "text-emerald-400" : "text-rose-500")}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/70 bg-card/40 backdrop-blur-md lg:flex">
        <div className="flex h-16 items-center border-b border-border/70 px-5">
          <Logo />
        </div>
        <NavLinks />
        <SystemStatus />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background lg:hidden"
              aria-label="Mobile navigation"
            >
              <div className="flex h-16 items-center justify-between border-b border-border/70 px-5">
                <Logo />
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavLinks onNavigate={onClose} />
              <SystemStatus />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
