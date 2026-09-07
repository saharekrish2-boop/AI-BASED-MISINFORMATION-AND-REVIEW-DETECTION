import { useState } from "react";
import { Menu, Sun, Moon, UserRound } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { Notifications } from "./Notifications";
import { cn } from "@/lib/utils";

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("truthlens-theme", next ? "dark" : "light");
  };
  return { dark, toggle };
}

export function TopNav({ onMenu }: { onMenu: () => void }) {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <button
        onClick={onMenu}
        aria-label="Open navigation menu"
        className="rounded-lg border border-border/70 bg-card/60 p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={toggle}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          className="rounded-lg border border-border/70 bg-card/60 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <Notifications />
        <div className="hidden items-center gap-2.5 rounded-lg border border-border/70 bg-card/60 py-1.5 pl-1.5 pr-3 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-cyan-500 text-[11px] font-bold text-white">
            TL
          </span>
          <div className="leading-tight">
            <p className="flex items-center gap-1 text-xs font-semibold text-foreground">
              Analyst <UserRound className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </p>
            <p className="text-[10px] text-muted-foreground">Local workspace</p>
          </div>
        </div>
      </div>
    </header>
  );
}
