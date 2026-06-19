import { Button } from "@/components/ui/button";
import {
  clearWorkspace,
  saveWorkspace,
  useStrategyWorkspace,
} from "@/hooks/useStrategyWorkspace";
import { parseCandleCsv } from "@/lib/strategyEngine";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileUp,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const YAHOO_PROXY_DATA_PATH = "/data/yahoo_futures_proxy_latest.csv";
const YAHOO_PROXY_DATA_NAME = "yahoo_futures_proxy_latest.csv";

function fmtDate(value?: number) {
  return value
    ? new Date(value).toISOString().slice(0, 16).replace("T", " ")
    : "n/a";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-bold text-foreground">
        {value}
      </p>
    </div>
  );
}

export default function DataUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { run, fileName: storedFileName, isLoading } = useStrategyWorkspace();
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [isLoadingProxyData, setIsLoadingProxyData] = useState(false);

  async function importCsvText(text: string, sourceName: string) {
    setFileName(sourceName);
    const result = parseCandleCsv(text, sourceName);
    setPreview(
      result.candles
        .slice(0, 5)
        .map(
          (candle) =>
            `${new Date(Number(candle.timestamp)).toISOString()} ${candle.symbol} ${candle.timeframe} O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`,
        )
        .join("\n"),
    );
    try {
      await saveWorkspace(
        result.candles,
        result.invalidRows,
        result.missingColumns,
        sourceName,
      );
      if (result.missingColumns.length > 0 || result.candles.length === 0) {
        toast.error("CSV refused. Required columns or valid rows are missing.");
      } else {
        toast.success(`Imported ${result.candles.length} real candles`);
      }
    } catch (error) {
      toast.error("Import failed while saving the dataset in browser storage.");
      console.error(error);
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    await importCsvText(text, file.name);
  }

  async function handleLoadYahooProxyData() {
    setIsLoadingProxyData(true);
    try {
      const response = await fetch(YAHOO_PROXY_DATA_PATH, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          `Bundled Yahoo proxy data failed to load: ${response.status}`,
        );
      }
      const text = await response.text();
      await importCsvText(text, YAHOO_PROXY_DATA_NAME);
    } catch (error) {
      toast.error(
        "Auto-load failed. The app refused to import because the bundled real dataset could not be loaded.",
      );
      console.error(error);
    } finally {
      setIsLoadingProxyData(false);
    }
  }

  async function handleClear() {
    await clearWorkspace();
    setFileName("");
    setPreview("");
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Cleared imported candle data");
  }

  const { integrity } = run;
  const displayFileName = fileName || storedFileName;

  return (
    <div className="space-y-6 p-4 md:p-6" data-ocid="data.page">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Data Integrity
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Import real OHLCV CSV data first. The engine refuses to generate
          signals until required fields and minimum timeframes are present.
        </p>
      </div>

      <div className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Required CSV schema
            </p>
            <code className="mt-2 block whitespace-pre-wrap bg-background p-3 font-mono text-xs text-muted-foreground">
              timestamp,open,high,low,close,volume,symbol,timeframe,timezone
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isLoadingProxyData}
              onClick={handleLoadYahooProxyData}
            >
              <Download className="mr-2 h-4 w-4" />
              {isLoadingProxyData ? "Loading..." : "Load Yahoo Proxy Data"}
            </Button>
            <Button type="button" onClick={() => fileRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            <Button type="button" variant="outline" onClick={handleClear}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>
        {displayFileName && (
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            Last import:{" "}
            <span className="text-foreground">{displayFileName}</span>
          </p>
        )}
      </div>

      {isLoading && (
        <div className="border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
          Loading saved candle dataset...
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Candles" value={integrity.candleCount} />
        <Metric label="Analysis candles" value={run.analysisCandleCount} />
        <Metric
          label="Symbols"
          value={integrity.symbols.join(", ") || "none"}
        />
        <Metric
          label="Timeframes"
          value={integrity.timeframes.join(", ") || "none"}
        />
        <Metric
          label="Derived TFs"
          value={run.derivedTimeframes.join(", ") || "none"}
        />
        <Metric label="Timezone" value={integrity.timezone} />
        <Metric label="Start" value={fmtDate(integrity.start)} />
        <Metric label="End" value={fmtDate(integrity.end)} />
        <Metric label="Missing candles" value={integrity.missingCandles} />
        <Metric label="Duplicate candles" value={integrity.duplicateCandles} />
      </div>

      <div
        className={`border p-4 ${
          integrity.canRunBacktest
            ? "border-chart-1/40 bg-chart-1/5"
            : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-start gap-3">
          {integrity.canRunBacktest ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-chart-1" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          )}
          <div>
            <p className="font-mono text-sm font-bold uppercase tracking-wider">
              {integrity.canRunBacktest ? "Engine armed" : "Engine refused"}
            </p>
            {integrity.blockers.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Real data is loaded and the required 1H plus 1D context exists.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                {integrity.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            )}
            {integrity.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                {integrity.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <pre className="overflow-x-auto border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
          {preview}
        </pre>
      )}
      <div className="flex items-center gap-2 border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
        <Database className="h-4 w-4 text-primary" />
        Browser-side processing is intentional for MVP: raw historical candles
        are not pushed on-chain repeatedly.
      </div>
    </div>
  );
}
