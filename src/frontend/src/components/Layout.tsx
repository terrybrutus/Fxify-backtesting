import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart2,
  Database,
  LineChart,
  Menu,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { path: "/upload", label: "Data Upload", icon: Database },
  { path: "/detect", label: "Setup Detector", icon: Settings2 },
  { path: "/chart", label: "Chart View", icon: LineChart },
  { path: "/results", label: "Backtest Results", icon: BarChart2 },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      data-ocid="app.page"
    >
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-background/80 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === "Enter" && setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-card border-r border-border shrink-0 transition-smooth z-30",
          isMobile
            ? cn(
                "fixed inset-y-0 left-0 w-56",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
              )
            : "w-52 relative",
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border shrink-0">
          <div className="w-6 h-6 bg-primary flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-display text-sm font-bold text-foreground tracking-widest uppercase">
            StratEdge
          </span>
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-smooth"
              data-ocid="app.close_sidebar_button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive =
              currentPath === path || currentPath.startsWith(`${path}/`);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => isMobile && setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-smooth",
                  isActive
                    ? "bg-primary/15 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-l-2 border-transparent",
                )}
                data-ocid={`nav.${path.replace("/", "")}_link`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer branding */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <p className="font-mono text-xs text-muted-foreground/50">
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-smooth"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar (mobile only) */}
        {isMobile && (
          <header className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-smooth"
              data-ocid="app.open_sidebar_button"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-display text-sm font-bold tracking-widest uppercase text-foreground">
                StratEdge
              </span>
            </div>
          </header>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
