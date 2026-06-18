import { cn } from "@/lib/utils";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Database,
  FileWarning,
  Filter,
  FlaskConical,
  GitCompareArrows,
  HeartPulse,
  ListChecks,
  Microscope,
  Radar,
  Radio,
  RotateCcw,
  ShieldCheck,
  Target,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/data", label: "Data Integrity", icon: Database },
  { path: "/health", label: "Rule Health", icon: HeartPulse },
  { path: "/audit", label: "Signal Audit", icon: ListChecks },
  { path: "/rejected", label: "Rejected Setups", icon: FileWarning },
  { path: "/discovery", label: "Discovery Lab", icon: FlaskConical },
  { path: "/experiments", label: "Experiment Lab", icon: Microscope },
  { path: "/sample-expansion", label: "Sample Expansion", icon: Filter },
  { path: "/forward", label: "Forward Tracker", icon: ShieldCheck },
  { path: "/walk-forward", label: "Walk-Forward Lab", icon: GitCompareArrows },
  { path: "/decisions", label: "Decision Console", icon: Target },
  { path: "/live-candidates", label: "Live Candidates", icon: Radio },
  { path: "/replay", label: "Replay Mode", icon: RotateCcw },
  { path: "/chart", label: "Candle Viewer", icon: Radar },
  { path: "/results", label: "Results Export", icon: BarChart3 },
];

export default function Layout() {
  const currentPath = useRouterState().location.pathname;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-primary/40 bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-widest">
                ICT Audit Lab
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                fail closed backtesting
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = currentPath === path;
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex items-center gap-3 border-l-2 px-3 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
          The app must fail closed, not fail open. If real data, required
          settings, or required calculations are missing, the app must refuse to
          generate strategy results instead of substituting mock data or
          placeholders.
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="border-b border-border bg-card px-4 py-3 md:hidden">
          <p className="font-display text-sm font-bold uppercase tracking-widest">
            ICT Audit Lab
          </p>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
