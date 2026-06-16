import { createActor } from "@/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccountSettings,
  useAddCandles,
  useAddFVGZone,
  useAddSundayLevel,
  useDeleteFVGZone,
  useDeleteSundayLevel,
  useFVGZones,
  useSetAccountSettings,
  useSundayLevels,
} from "@/hooks/useBackend";
import type { FVGZone, SundayLevel } from "@/types/strategy";
import { type Candle, Timeframe } from "@/types/strategy";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileUp,
  Info,
  Layers,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type ParsedRow = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2)
    throw new Error("CSV must have a header row and at least one data row");
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (parts.length < 6) continue;
    rows.push({
      timestamp: new Date(parts[0]).getTime(),
      open: Number.parseFloat(parts[1]),
      high: Number.parseFloat(parts[2]),
      low: Number.parseFloat(parts[3]),
      close: Number.parseFloat(parts[4]),
      volume: Number.parseFloat(parts[5]),
    });
  }
  return rows.filter(
    (r) => !Number.isNaN(r.timestamp) && !Number.isNaN(r.open),
  );
}

function formatDate(ts: bigint): string {
  return new Date(Number(ts)).toISOString().slice(0, 10);
}

function calcLotSize(accountSize: number): number {
  const minAcc = 15000;
  const maxAcc = 50000;
  const minLot = 0.11;
  const maxLot = 0.35;
  if (accountSize <= minAcc) return minLot;
  if (accountSize >= maxAcc) return maxLot;
  return +(
    minLot +
    ((accountSize - minAcc) / (maxAcc - minAcc)) * (maxLot - minLot)
  ).toFixed(3);
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-5 py-4 bg-card border border-border hover:border-primary/40 transition-colors duration-200"
      data-ocid={`upload.${title.toLowerCase().replace(/\s+/g, "_")}_toggle`}
    >
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <span className="font-mono text-xs uppercase tracking-widest text-foreground font-bold flex-1 text-left">
        {title}
      </span>
      {count !== undefined && (
        <Badge
          variant="outline"
          className="font-mono text-xs border-primary/40 text-primary mr-2"
        >
          {count}
        </Badge>
      )}
      {expanded ? (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function DeleteAllCandlesAction({ timeframe }: { timeframe: Timeframe }) {
  const { actor, isFetching } = useActor(createActor);
  const [pending, setPending] = useState(false);
  async function handleClear() {
    if (!actor) {
      toast.error("Not connected");
      return;
    }
    setPending(true);
    try {
      await actor.deleteAllCandles(timeframe);
      toast.success(`Cleared all ${timeframe} candle data`);
    } catch {
      toast.error("Clear failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      type="button"
      variant="destructive"
      onClick={handleClear}
      disabled={pending || isFetching}
      className="font-mono text-xs uppercase tracking-wider"
      data-ocid="upload.clear_button"
    >
      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
      {pending ? "Clearing..." : `Clear ${timeframe} Data`}
    </Button>
  );
}

function CsvUploadSection() {
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.H1);
  const [clearTf, setClearTf] = useState<Timeframe>(Timeframe.H1);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const addCandles = useAddCandles();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        setParsed(rows);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Parse failed");
        setParsed(null);
      }
    };
    reader.readAsText(file);
  }

  async function handleUpload() {
    if (!parsed) return;
    const candles: Candle[] = parsed.map((r) => ({
      timestamp: BigInt(r.timestamp),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      timeframe,
    }));
    try {
      await addCandles.mutateAsync(candles);
      toast.success(`Uploaded ${candles.length} candles (${timeframe})`);
      setParsed(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      toast.error("Upload failed. Try again.");
    }
  }

  return (
    <div className="border border-border">
      <SectionHeader
        icon={Database}
        title="Candle Data Upload"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="p-5 space-y-5 bg-background">
          <div className="border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-xs text-primary uppercase tracking-wider">
                Required CSV Format
              </span>
            </div>
            <code className="block text-xs font-mono text-muted-foreground bg-muted/30 p-3">
              date,open,high,low,close,volume
              <br />
              2024-01-07 00:00:00,2650.5,2678.2,2641.0,2671.3,12450
              <br />
              2024-01-08 00:00:00,2671.3,2695.0,2658.1,2688.8,15230
            </code>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Timeframe
              </Label>
              <Select
                value={timeframe}
                onValueChange={(v) => setTimeframe(v as Timeframe)}
              >
                <SelectTrigger
                  className="font-mono border-border bg-card"
                  data-ocid="upload.timeframe_select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Timeframe.H1} className="font-mono">
                    1 Hour (H1)
                  </SelectItem>
                  <SelectItem value={Timeframe.H4} className="font-mono">
                    4 Hour (H4)
                  </SelectItem>
                  <SelectItem value={Timeframe.Daily} className="font-mono">
                    Daily
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                CSV File
              </Label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="border border-dashed border-border hover:border-primary/60 transition-colors duration-200 p-4 text-center cursor-pointer w-full bg-card"
                aria-label="Select CSV file"
                data-ocid="upload.dropzone"
              >
                <FileUp className="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
                {fileName ? (
                  <p className="font-mono text-xs text-primary truncate">
                    {fileName}
                  </p>
                ) : (
                  <p className="font-mono text-xs text-muted-foreground">
                    Click to select .csv
                  </p>
                )}
              </button>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
                data-ocid="upload.file_input"
              />
            </div>
          </div>
          {parseError && (
            <div
              className="flex items-center gap-2 text-destructive font-mono text-xs"
              data-ocid="upload.error_state"
            >
              <AlertCircle className="w-4 h-4" />
              {parseError}
            </div>
          )}
          {parsed && !parseError && (
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 text-primary font-mono text-xs"
                data-ocid="upload.success_state"
              >
                <CheckCircle2 className="w-4 h-4" />
                Parsed <span className="font-bold ml-1">{parsed.length}</span>{" "}
                candles ready to upload
              </div>
              <div className="border border-border overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  Preview: first 5 rows
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-border">
                        {["Date", "Open", "High", "Low", "Close", "Volume"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left text-muted-foreground font-normal"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 5).map((row) => (
                        <tr
                          key={String(row.timestamp)}
                          className="border-b border-border/40 hover:bg-muted/20"
                          data-ocid={`upload.preview.item.${parsed.indexOf(row) + 1}`}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {new Date(row.timestamp).toISOString().slice(0, 10)}
                          </td>
                          <td className="px-3 py-1.5">{row.open.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-primary">
                            {row.high.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-destructive">
                            {row.low.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5">
                            {row.close.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {row.volume.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!parsed || addCandles.isPending}
            className="w-full font-mono uppercase tracking-wider"
            data-ocid="upload.submit_button"
          >
            <Database className="w-4 h-4 mr-2" />
            {addCandles.isPending
              ? "Uploading..."
              : `Upload ${parsed ? parsed.length : 0} Candles`}
          </Button>
          <div className="border border-border/40 bg-card p-4 space-y-3">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              Clear Timeframe Data
            </span>
            <div className="flex items-center gap-3">
              <Select
                value={clearTf}
                onValueChange={(v) => setClearTf(v as Timeframe)}
              >
                <SelectTrigger
                  className="font-mono border-border bg-background w-36"
                  data-ocid="upload.clear_timeframe_select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Timeframe.H1} className="font-mono">
                    H1
                  </SelectItem>
                  <SelectItem value={Timeframe.H4} className="font-mono">
                    H4
                  </SelectItem>
                  <SelectItem value={Timeframe.Daily} className="font-mono">
                    Daily
                  </SelectItem>
                </SelectContent>
              </Select>
              <DeleteAllCandlesAction timeframe={clearTf} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SundayLevelsSection() {
  const [expanded, setExpanded] = useState(true);
  const { data: levels, isLoading } = useSundayLevels();
  const addLevel = useAddSundayLevel();
  const deleteLevel = useDeleteSundayLevel();
  const [weekDate, setWeekDate] = useState("");
  const [price, setPrice] = useState("");
  const [levelLabel, setLevelLabel] = useState("");

  async function handleAdd() {
    const priceNum = Number.parseFloat(price);
    if (!weekDate || Number.isNaN(priceNum)) {
      toast.error("Fill in week date and price");
      return;
    }
    try {
      await addLevel.mutateAsync({
        weekTimestamp: BigInt(new Date(weekDate).getTime()),
        price: priceNum,
        levelLabel: levelLabel || `Level ${price}`,
      });
      toast.success("Sunday level added");
      setWeekDate("");
      setPrice("");
      setLevelLabel("");
    } catch {
      toast.error("Failed to add level");
    }
  }

  async function handleDelete(id: bigint) {
    try {
      await deleteLevel.mutateAsync(id);
      toast.success("Level removed");
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="border border-border">
      <SectionHeader
        icon={CalendarDays}
        title="Sunday Levels"
        count={levels?.length ?? 0}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="p-5 space-y-5 bg-background">
          <div className="border border-border/50 bg-card p-4 space-y-4">
            <span className="font-mono text-xs text-primary uppercase tracking-wider">
              Add Sunday Level
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Week Start (Sunday)
                </Label>
                <Input
                  type="date"
                  value={weekDate}
                  onChange={(e) => setWeekDate(e.target.value)}
                  className="font-mono bg-background border-border"
                  data-ocid="sunday.date_input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Price Level
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="2650.00"
                  className="font-mono bg-background border-border"
                  data-ocid="sunday.price_input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Label (optional)
                </Label>
                <Input
                  type="text"
                  value={levelLabel}
                  onChange={(e) => setLevelLabel(e.target.value)}
                  placeholder="Support / Resistance"
                  className="font-mono bg-background border-border"
                  data-ocid="sunday.label_input"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={addLevel.isPending}
              className="font-mono uppercase tracking-wider text-xs"
              data-ocid="sunday.add_button"
            >
              <Plus className="w-3.5 h-3.5 mr-2" />
              {addLevel.isPending ? "Adding..." : "Add Sunday Level"}
            </Button>
          </div>
          {isLoading ? (
            <div
              className="font-mono text-xs text-muted-foreground py-4 text-center"
              data-ocid="sunday.loading_state"
            >
              Loading levels...
            </div>
          ) : !levels?.length ? (
            <div
              className="border border-dashed border-border/40 p-6 text-center"
              data-ocid="sunday.empty_state"
            >
              <CalendarDays className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-mono text-xs text-muted-foreground">
                No Sunday levels defined yet
              </p>
            </div>
          ) : (
            <div className="border border-border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 grid grid-cols-4 gap-3 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <span>Week</span>
                <span>Price</span>
                <span>Label</span>
                <span className="text-right">Del</span>
              </div>
              {(levels as SundayLevel[]).map((lvl, i) => (
                <div
                  key={String(lvl.id)}
                  className="grid grid-cols-4 gap-3 px-3 py-2.5 border-b border-border/40 items-center hover:bg-muted/20"
                  data-ocid={`sunday.item.${i + 1}`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(lvl.weekTimestamp)}
                  </span>
                  <span className="font-mono text-xs text-primary font-bold">
                    {lvl.price.toFixed(2)}
                  </span>
                  <span className="font-mono text-xs truncate">
                    {lvl.levelLabel || ""}
                  </span>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDelete(lvl.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors duration-200 p-1"
                      aria-label="Delete level"
                      data-ocid={`sunday.delete_button.${i + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FVGZonesSection() {
  const [expanded, setExpanded] = useState(true);
  const { data: zones, isLoading } = useFVGZones();
  const addZone = useAddFVGZone();
  const deleteZone = useDeleteFVGZone();
  const [zoneDate, setZoneDate] = useState("");
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  const [isBullish, setIsBullish] = useState(true);

  async function handleAdd() {
    const topNum = Number.parseFloat(top);
    const bottomNum = Number.parseFloat(bottom);
    if (!zoneDate || Number.isNaN(topNum) || Number.isNaN(bottomNum)) {
      toast.error("Fill in all FVG zone fields");
      return;
    }
    if (topNum <= bottomNum) {
      toast.error("Top must be greater than bottom");
      return;
    }
    try {
      await addZone.mutateAsync({
        timestamp: BigInt(new Date(zoneDate).getTime()),
        top: topNum,
        bottom: bottomNum,
        isBullish,
      });
      toast.success(`FVG zone added (${isBullish ? "Bullish" : "Bearish"})`);
      setZoneDate("");
      setTop("");
      setBottom("");
    } catch {
      toast.error("Failed to add FVG zone");
    }
  }

  async function handleDelete(id: bigint) {
    try {
      await deleteZone.mutateAsync(id);
      toast.success("FVG zone removed");
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="border border-border">
      <SectionHeader
        icon={Layers}
        title="1H FVG Zones"
        count={zones?.length ?? 0}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="p-5 space-y-5 bg-background">
          <div className="border border-border/50 bg-card p-4 space-y-4">
            <span className="font-mono text-xs text-primary uppercase tracking-wider">
              Add 1H FVG Zone
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Timestamp
                </Label>
                <Input
                  type="datetime-local"
                  value={zoneDate}
                  onChange={(e) => setZoneDate(e.target.value)}
                  className="font-mono bg-background border-border"
                  data-ocid="fvg.date_input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Direction
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBullish(true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border font-mono text-xs transition-colors duration-200 ${
                      isBullish
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    data-ocid="fvg.bullish_toggle"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    Bullish
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBullish(false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border font-mono text-xs transition-colors duration-200 ${
                      !isBullish
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border text-muted-foreground hover:border-destructive/40"
                    }`}
                    data-ocid="fvg.bearish_toggle"
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    Bearish
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Top Price
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={top}
                  onChange={(e) => setTop(e.target.value)}
                  placeholder="2690.00"
                  className="font-mono bg-background border-border"
                  data-ocid="fvg.top_input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Bottom Price
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bottom}
                  onChange={(e) => setBottom(e.target.value)}
                  placeholder="2680.00"
                  className="font-mono bg-background border-border"
                  data-ocid="fvg.bottom_input"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={addZone.isPending}
              className="font-mono uppercase tracking-wider text-xs"
              data-ocid="fvg.add_button"
            >
              <Plus className="w-3.5 h-3.5 mr-2" />
              {addZone.isPending ? "Adding..." : "Add FVG Zone"}
            </Button>
          </div>
          {isLoading ? (
            <div
              className="font-mono text-xs text-muted-foreground py-4 text-center"
              data-ocid="fvg.loading_state"
            >
              Loading FVG zones...
            </div>
          ) : !zones?.length ? (
            <div
              className="border border-dashed border-border/40 p-6 text-center"
              data-ocid="fvg.empty_state"
            >
              <Layers className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-mono text-xs text-muted-foreground">
                No FVG zones defined yet
              </p>
            </div>
          ) : (
            <div className="border border-border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 grid grid-cols-5 gap-2 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <span>Date/Time</span>
                <span>Top</span>
                <span>Bottom</span>
                <span>Type</span>
                <span className="text-right">Del</span>
              </div>
              {(zones as FVGZone[]).map((z, i) => (
                <div
                  key={String(z.id)}
                  className="grid grid-cols-5 gap-2 px-3 py-2.5 border-b border-border/40 items-center hover:bg-muted/20"
                  data-ocid={`fvg.item.${i + 1}`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(Number(z.timestamp)).toISOString().slice(0, 13)}h
                  </span>
                  <span className="font-mono text-xs text-primary">
                    {z.top.toFixed(2)}
                  </span>
                  <span className="font-mono text-xs text-destructive">
                    {z.bottom.toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-xs font-bold ${z.isBullish ? "text-primary" : "text-destructive"}`}
                  >
                    {z.isBullish ? "BULL" : "BEAR"}
                  </span>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDelete(z.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors duration-200 p-1"
                      aria-label="Delete FVG zone"
                      data-ocid={`fvg.delete_button.${i + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccountSettingsSection() {
  const [expanded, setExpanded] = useState(true);
  const { data: settings } = useAccountSettings();
  const setSettingsMut = useSetAccountSettings();
  const [accountSize, setAccountSize] = useState("");
  const inputSize =
    accountSize !== ""
      ? Number.parseFloat(accountSize)
      : (settings?.accountSize ?? 15000);
  const estimatedLot = calcLotSize(Number.isNaN(inputSize) ? 15000 : inputSize);

  async function handleSave() {
    const size = Number.parseFloat(accountSize);
    if (Number.isNaN(size) || size <= 0) {
      toast.error("Enter a valid account size");
      return;
    }
    try {
      await setSettingsMut.mutateAsync({
        accountSize: size,
        baseLotSize: calcLotSize(size),
        scaleReference: 15000,
      });
      toast.success("Account settings saved");
      setAccountSize("");
    } catch {
      toast.error("Save failed");
    }
  }

  return (
    <div className="border border-border">
      <SectionHeader
        icon={Wallet}
        title="Account Settings"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="p-5 space-y-5 bg-background">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Account Size (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    value={accountSize}
                    onChange={(e) => setAccountSize(e.target.value)}
                    placeholder={String(settings?.accountSize ?? 15000)}
                    className="pl-7 font-mono bg-card border-border"
                    data-ocid="account.size_input"
                  />
                </div>
              </div>
              <Button
                type="button"
                onClick={handleSave}
                disabled={setSettingsMut.isPending || accountSize === ""}
                className="w-full font-mono uppercase tracking-wider"
                data-ocid="account.save_button"
              >
                <SettingsIcon className="w-4 h-4 mr-2" />
                {setSettingsMut.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
            <div className="border border-primary/20 bg-card p-4 space-y-4">
              <span className="font-mono text-xs text-primary uppercase tracking-wider block">
                Lot Size Calculator
              </span>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs text-muted-foreground">
                    Account Size
                  </span>
                  <span className="font-mono text-sm">
                    $
                    {(Number.isNaN(inputSize)
                      ? 15000
                      : inputSize
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border/40 pt-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    Estimated Lot Size
                  </span>
                  <span
                    className="font-mono text-2xl text-primary font-bold"
                    data-ocid="account.lot_size_display"
                  >
                    {estimatedLot.toFixed(3)}
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground/60 space-y-1 pt-1">
                  <p>$15k - 0.11 lots (base reference)</p>
                  <p>$50k - 0.35 lots (scale reference)</p>
                  <p>Linear interpolation applied</p>
                </div>
              </div>
            </div>
          </div>
          {settings && (
            <div
              className="border border-border/40 bg-muted/20 p-3 flex items-center gap-6"
              data-ocid="account.current_settings"
            >
              <Badge
                variant="outline"
                className="font-mono text-xs border-primary/40 text-primary"
              >
                Saved
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                Account:{" "}
                <span className="text-foreground">
                  ${settings.accountSize.toLocaleString()}
                </span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                Base Lot:{" "}
                <span className="text-primary">
                  {settings.baseLotSize.toFixed(3)}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataUploadPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl" data-ocid="upload.page">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
          Data Setup
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          Configure candle data, Sunday levels, FVG zones, and account settings
          for backtesting.
        </p>
      </div>
      <CsvUploadSection />
      <SundayLevelsSection />
      <FVGZonesSection />
      <AccountSettingsSection />
    </div>
  );
}
