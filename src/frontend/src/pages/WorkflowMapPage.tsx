import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FlaskConical,
  Radio,
} from "lucide-react";

const EASTERN_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

function fmtEastern(value?: number) {
  return value ? EASTERN_FORMATTER.format(new Date(value)) : "n/a";
}

function hoursBehind(value?: number) {
  if (!value) return undefined;
  return (Date.now() - value) / (60 * 60 * 1000);
}

function WorkflowCard({
  title,
  state,
  body,
  icon: Icon,
}: {
  title: string;
  state: "connected" | "research" | "stale" | "reference";
  body: string;
  icon: typeof Database;
}) {
  const border =
    state === "connected"
      ? "border-chart-1/40 bg-chart-1/5"
      : state === "research"
        ? "border-primary/30 bg-primary/5"
        : state === "stale"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-card";
  return (
    <div className={`border p-4 ${border}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest">
            {title}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowMapPage() {
  const { run, fileName } = useStrategyWorkspace();
  const lag = hoursBehind(run.integrity.end);
  const stale = lag === undefined || lag > 24;

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="workflow-map.page">
      <div>
        <h1 className="font-display text-2xl font-bold">Workflow Map</h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          This page explains which left-panel items are connected to the current
          imported data and which pages are research/history views. Use it as
          the control tower before making decisions.
        </p>
      </div>

      <section
        className={`border p-4 ${
          stale
            ? "border-destructive/40 bg-destructive/5"
            : "border-chart-1/40 bg-chart-1/5"
        }`}
      >
        <div className="flex items-start gap-3">
          {stale ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-chart-1" />
          )}
          <div>
            <p className="font-mono text-sm font-bold uppercase tracking-wider">
              {stale
                ? "Data is stale for live decisions"
                : "Data is fresh enough to inspect"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Source: {fileName || run.integrity.source || "none"}. Latest
              candle: {fmtEastern(run.integrity.end)}.{" "}
              {lag !== undefined
                ? `That is about ${lag.toFixed(1)} hours behind this computer.`
                : "No imported candle end time is available."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <WorkflowCard
          title="Data Integrity"
          state="connected"
          icon={Database}
          body="The shared source of truth. If the latest candle is stale, every signal page is stale too."
        />
        <WorkflowCard
          title="Brutus Band Lab"
          state="research"
          icon={FlaskConical}
          body="Connected to imported 1H/5m candles. This is currently the most actionable Brutus research path, but it is still replay logic, not a live broker feed."
        />
        <WorkflowCard
          title="Live Candidates"
          state="connected"
          icon={Radio}
          body="Connected to the existing ICT/Coco engine. It can only replay candidates inside the imported candle range."
        />
        <WorkflowCard
          title="Forward Tracker"
          state="reference"
          icon={Clock}
          body="Tracks frozen rules against newer imported candles. It does not fetch candles by itself."
        />
      </div>

      <section className="border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">
          Current answer
        </p>
        <p className="mt-2">
          The app is useful for research and replay now. It is not ready to call
          live trades unless the imported dataset includes the current session
          and the candidate rule appears in a decision page as a research
          candidate with fresh data.
        </p>
      </section>
    </div>
  );
}
