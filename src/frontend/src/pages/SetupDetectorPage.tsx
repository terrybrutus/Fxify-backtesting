import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { SignalAudit } from "@/types/strategy";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Download, XCircle } from "lucide-react";

function SignalCard({ signal }: { signal: SignalAudit }) {
  return (
    <article className="border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {new Date(signal.timestamp).toISOString()} | {signal.symbol} |{" "}
            {signal.timeframe}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold">
            {signal.setupType}
          </h2>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {signal.accepted ? (
            <CheckCircle2 className="h-4 w-4 text-chart-1" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span>{signal.accepted ? "Accepted" : "Rejected"}</span>
          <span className="border border-border px-2 py-1">
            Score {signal.score}/7
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <p className="font-mono text-xs">Entry: {signal.entry.toFixed(2)}</p>
        <p className="font-mono text-xs">Stop: {signal.stop.toFixed(2)}</p>
        <p className="font-mono text-xs">TP1: {signal.tp1.toFixed(2)}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Reasons
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {signal.reasons.map((reason) => (
              <li key={reason.label}>
                {reason.passed ? "TRUE" : "FALSE"} - {reason.label}:{" "}
                {reason.detail}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
            Blockers
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {signal.blockers.map((blocker) => (
              <li key={blocker.label}>
                {blocker.label}: {blocker.passed ? "TRUE" : "FALSE"}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
        {signal.explanation}
      </p>
    </article>
  );
}

export default function SetupDetectorPage() {
  const { run } = useStrategyWorkspace();
  const signals = run.acceptedSignals.slice(0, 50);

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="audit.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Signal Audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every accepted setup includes reasons, blockers, prices, and the
            timestamp where information became available.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/results">
            <Download className="mr-2 h-4 w-4" />
            Export Logs
          </Link>
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-destructive">
            No strategy results generated
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Load valid real 1H and 1D candle data on the Data Integrity page.
          </p>
        </div>
      ) : signals.length === 0 ? (
        <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
          Engine ran, but no accepted setups met the current threshold. Check
          Rejected Setups for the useful evidence.
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
