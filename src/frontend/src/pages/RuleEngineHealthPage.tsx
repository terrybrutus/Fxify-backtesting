import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { CheckCircle2, XCircle } from "lucide-react";

export default function RuleEngineHealthPage() {
  const { run } = useStrategyWorkspace();

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="health.page">
      <div>
        <h1 className="font-display text-2xl font-bold">Rule Engine Health</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Visible tests for calculations and fail-closed behavior. These are not
          marketing badges; a failed check means the engine should not be trusted
          until the reason is understood.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {run.health.map((check) => (
          <div
            key={check.name}
            className={`border p-4 ${
              check.passed
                ? "border-chart-1/30 bg-chart-1/5"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <div className="flex items-start gap-3">
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-chart-1" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              )}
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  {check.name}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {check.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
