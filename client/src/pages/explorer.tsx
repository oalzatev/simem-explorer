import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Download,
  Camera,
  BookmarkPlus,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  HardDrive,
  FolderOpen,
  Save,
  Layers,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import type { SimemDataset } from "@shared/schema";

const CHART_COLORS = [
  "hsl(187, 72%, 48%)",  // cyan
  "hsl(45, 93%, 47%)",   // amber
  "hsl(160, 60%, 45%)",  // emerald
  "hsl(270, 60%, 55%)",  // violet
  "hsl(24, 80%, 55%)",   // orange
];

const CATEGORY_LABELS: Record<string, string> = {
  precio: "Precios",
  demanda: "Demanda",
  generacion: "Generación",
  hidrologia: "Hidrología",
};

const CATEGORY_ORDER = ["precio", "demanda", "generacion", "hidrologia"];

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// Stats calculation
function computeStats(values: number[]) {
  const filtered = values.filter((v) => v !== null && !isNaN(v));
  if (filtered.length === 0) return { min: 0, max: 0, mean: 0, stddev: 0, count: 0 };
  const count = filtered.length;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const mean = filtered.reduce((a, b) => a + b, 0) / count;
  const variance = filtered.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);
  return { min, max, mean, stddev, count };
}

// Pearson correlation
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(2);
}

export default function ExplorerPage() {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    precio: true,
    demanda: true,
    generacion: true,
    hidrologia: true,
  });
  const [fetchedData, setFetchedData] = useState<Record<string, { records: any[]; dataset: SimemDataset }>>({});
  const [isFetching, setIsFetching] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [exportDir, setExportDir] = useState("");
  const [isSavingToDisk, setIsSavingToDisk] = useState(false);
  const [saveDiskProgress, setSaveDiskProgress] = useState("");
  const [savedFiles, setSavedFiles] = useState<string[]>([]);

  // Fetch export path config
  const { data: configData } = useQuery<{ exportPath: string }>({
    queryKey: ["/api/config"],
  });

  // Set export dir from config on first load
  useState(() => {
    if (configData?.exportPath && !exportDir) {
      setExportDir(configData.exportPath);
    }
  });

  // Update exportDir when config loads
  if (configData?.exportPath && !exportDir) {
    setExportDir(configData.exportPath);
  }

  // Fetch datasets catalog
  const { data: datasetsByCategory, isLoading: datasetsLoading } = useQuery<Record<string, SimemDataset[]>>({
    queryKey: ["/api/datasets"],
  });

  // Mutation to save preset
  const savePresetMutation = useMutation({
    mutationFn: async (data: { name: string; datasetIds: string; startDate: string; endDate: string }) => {
      const res = await apiRequest("POST", "/api/presets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset guardado", description: "Tu consulta fue guardada exitosamente." });
      setPresetDialogOpen(false);
      setPresetName("");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo guardar el preset.", variant: "destructive" });
    },
  });

  const toggleDataset = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) {
        toast({ title: "Límite alcanzado", description: "Máximo 5 variables a la vez." });
        return prev;
      }
      return [...prev, id];
    });
  };

  const [fetchProgress, setFetchProgress] = useState("");

  const handleFetch = async () => {
    if (selectedIds.length === 0) {
      toast({ title: "Sin selección", description: "Selecciona al menos una variable.", variant: "destructive" });
      return;
    }
    setIsFetching(true);
    const results: Record<string, any> = {};
    try {
      for (let i = 0; i < selectedIds.length; i++) {
        const dsId = selectedIds[i];
        const dsName = datasetsByCategory ? Object.values(datasetsByCategory).flat().find((d: any) => d.datasetId === dsId)?.name || dsId : dsId;
        setFetchProgress(`Descargando ${i + 1}/${selectedIds.length}: ${dsName}... (puede tardar unos minutos)`);
        const res = await fetch(`/api/datasets/${dsId}/data?startDate=${startDate}&endDate=${endDate}`, {
          signal: AbortSignal.timeout(600000),
        });
        if (!res.ok) throw new Error(`Error ${res.status} al consultar ${dsName}`);
        const json = await res.json();
        results[dsId] = json;
      }
      setFetchedData(results);
      setFetchProgress("");
      toast({ title: "Consulta exitosa", description: `${selectedIds.length} variable(s) cargadas.` });
    } catch (err: any) {
      setFetchProgress("");
      toast({ title: "Error al consultar", description: err.message || "Ocurrió un error. Intenta con un rango más corto.", variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  };

  const handleExportCSV = (dsId: string) => {
    const url = `/api/datasets/${dsId}/data/export?startDate=${startDate}&endDate=${endDate}&format=csv`;
    const apiBase = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    window.open(`${apiBase}${url}`, "_blank");
  };

  const handleUpdateExportPath = async () => {
    if (!exportDir.trim()) return;
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportPath: exportDir.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Ruta actualizada", description: `Archivos se guardarán en: ${json.exportPath}` });
      } else {
        toast({ title: "Error", description: json.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar la ruta.", variant: "destructive" });
    }
  };

  const handleSaveToDisk = async (dsId: string) => {
    try {
      const res = await fetch("/api/datasets/save-to-disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: dsId, startDate, endDate }),
        signal: AbortSignal.timeout(600000),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Guardado", description: `${json.filename} (${json.records} registros)` });
        return json.filename;
      } else {
        toast({ title: "Error", description: json.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    return null;
  };

  const handleSaveAllByYear = async () => {
    if (selectedIds.length === 0) return;

    // First update export path
    if (exportDir.trim()) {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportPath: exportDir.trim() }),
      });
    }

    setIsSavingToDisk(true);
    const allSavedFiles: Record<string, string[]> = {};

    try {
      // Generate year ranges
      const startYear = parseInt(startDate.split("-")[0]);
      const endYear = parseInt(endDate.split("-")[0]);
      const yearRanges: Array<{ start: string; end: string }> = [];
      for (let y = startYear; y <= endYear; y++) {
        const yStart = y === startYear ? startDate : `${y}-01-01`;
        const yEnd = y === endYear ? endDate : `${y}-12-31`;
        yearRanges.push({ start: yStart, end: yEnd });
      }

      for (let i = 0; i < selectedIds.length; i++) {
        const dsId = selectedIds[i];
        const dsName = datasetsByCategory ? Object.values(datasetsByCategory).flat().find((d: any) => d.datasetId === dsId)?.name || dsId : dsId;
        allSavedFiles[dsId] = [];

        for (let j = 0; j < yearRanges.length; j++) {
          const yr = yearRanges[j];
          setSaveDiskProgress(`Guardando ${dsName}: año ${yr.start.split("-")[0]} (${j + 1}/${yearRanges.length})... Variable ${i + 1}/${selectedIds.length}`);

          const res = await fetch("/api/datasets/save-to-disk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ datasetId: dsId, startDate: yr.start, endDate: yr.end }),
            signal: AbortSignal.timeout(600000),
          });
          const json = await res.json();
          if (json.success && json.filename) {
            allSavedFiles[dsId].push(json.filename);
          }
        }

        // Concatenate if more than one year
        if (allSavedFiles[dsId].length > 1) {
          setSaveDiskProgress(`Concatenando ${dsName}...`);
          const safeName = dsName.replace(/[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da\u00f1\u00d1 ]/g, "").replace(/\s+/g, "_");
          const outName = `${safeName}_${startDate}_${endDate}_COMPLETO.csv`;
          const concatRes = await fetch("/api/datasets/concatenate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: allSavedFiles[dsId], outputName: outName }),
          });
          const concatJson = await concatRes.json();
          if (concatJson.success) {
            allSavedFiles[dsId].push(concatJson.filename);
          }
        }
      }

      const totalFiles = Object.values(allSavedFiles).flat();
      setSavedFiles(totalFiles);
      setSaveDiskProgress("");
      toast({
        title: "Archivos guardados en disco",
        description: `${totalFiles.length} archivos en: ${exportDir || "./exports"}`,
      });
    } catch (err: any) {
      setSaveDiskProgress("");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingToDisk(false);
    }
  };

  const handleExportChart = async () => {
    if (!chartRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(chartRef.current, { backgroundColor: null });
      const link = document.createElement("a");
      link.download = `simem_chart_${startDate}_${endDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Gráfica exportada", description: "La imagen fue descargada." });
    } catch {
      toast({ title: "Error", description: "No se pudo exportar la gráfica.", variant: "destructive" });
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePresetMutation.mutate({
      name: presetName.trim(),
      datasetIds: JSON.stringify(selectedIds),
      startDate,
      endDate,
    });
  };

  // Merge data for chart
  const { chartData, datasetNames } = useMemo(() => {
    const dataMap = new Map<string, Record<string, number | null>>();
    const names: Record<string, string> = {};

    for (const dsId of selectedIds) {
      const entry = fetchedData[dsId];
      if (!entry?.records) continue;
      names[dsId] = entry.dataset?.name || dsId;
      for (const rec of entry.records) {
        const dateKey = rec.date ? rec.date.split("T")[0] : "";
        if (!dateKey) continue;
        if (!dataMap.has(dateKey)) {
          dataMap.set(dateKey, { date: dateKey as any });
        }
        const row = dataMap.get(dateKey)!;
        row[dsId] = rec.value;
      }
    }

    const sorted = Array.from(dataMap.values()).sort((a, b) =>
      ((a as any).date as string).localeCompare((b as any).date as string)
    );
    return { chartData: sorted, datasetNames: names };
  }, [fetchedData, selectedIds]);

  // Stats per dataset
  const statsPerDataset = useMemo(() => {
    const stats: Record<string, ReturnType<typeof computeStats>> = {};
    for (const dsId of selectedIds) {
      const entry = fetchedData[dsId];
      if (!entry?.records) continue;
      const values = entry.records.map((r: any) => r.value).filter((v: any) => v !== null && v !== undefined);
      stats[dsId] = computeStats(values);
    }
    return stats;
  }, [fetchedData, selectedIds]);

  // Correlation matrix
  const correlationMatrix = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const activeIds = selectedIds.filter((id) => fetchedData[id]?.records?.length > 0);
    if (activeIds.length < 2) return null;

    const matrix: Record<string, Record<string, number>> = {};
    for (const idA of activeIds) {
      matrix[idA] = {};
      for (const idB of activeIds) {
        if (idA === idB) {
          matrix[idA][idB] = 1;
        } else {
          const valsA: number[] = [];
          const valsB: number[] = [];
          // Align by date
          const mapB = new Map<string, number>();
          for (const r of fetchedData[idB].records) {
            if (r.value !== null) mapB.set(r.date?.split("T")[0] || "", r.value);
          }
          for (const r of fetchedData[idA].records) {
            const dk = r.date?.split("T")[0] || "";
            if (r.value !== null && mapB.has(dk)) {
              valsA.push(r.value);
              valsB.push(mapB.get(dk)!);
            }
          }
          matrix[idA][idB] = pearsonCorrelation(valsA, valsB);
        }
      }
    }
    return { matrix, ids: activeIds };
  }, [fetchedData, selectedIds]);

  const hasResults = Object.keys(fetchedData).length > 0;

  // Apply preset from URL query params or from presets page
  const applyPreset = useCallback((ids: string[], start: string, end: string) => {
    setSelectedIds(ids);
    setStartDate(start);
    setEndDate(end);
  }, []);

  // Expose applyPreset on window for cross-page usage
  (window as any).__applyPreset = applyPreset;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      {/* Top bar: Date range + Controls */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha inicio</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[160px] text-sm"
              data-testid="input-start-date"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha fin</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px] text-sm"
              data-testid="input-end-date"
            />
          </div>
          <Button
            onClick={handleFetch}
            disabled={isFetching || selectedIds.length === 0}
            className="gap-2"
            data-testid="btn-consultar"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Consultar
          </Button>
          {hasResults && (
            <div className="flex gap-2 ml-auto">
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveAllByYear}
                disabled={isSavingToDisk}
                className="gap-1 text-xs"
                data-testid="btn-save-all-disk"
              >
                {isSavingToDisk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                Guardar Todo en Disco
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportChart} className="gap-1 text-xs" data-testid="btn-export-chart">
                <Camera className="w-3.5 h-3.5" /> Exportar Gráfica
              </Button>
              <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" data-testid="btn-save-preset">
                    <BookmarkPlus className="w-3.5 h-3.5" /> Guardar Preset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Guardar Preset</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div>
                      <Label>Nombre del preset</Label>
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Ej: Precios última semana"
                        data-testid="input-preset-name"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedIds.length} variable(s) · {startDate} a {endDate}
                    </div>
                    <Button
                      onClick={handleSavePreset}
                      disabled={!presetName.trim() || savePresetMutation.isPending}
                      className="w-full"
                      data-testid="btn-confirm-save-preset"
                    >
                      {savePresetMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Variable selector panel */}
        <div className="w-[280px] shrink-0 border-r border-border bg-card/50 overflow-y-auto p-4">
          {/* Export path config */}
          <div className="mb-4 pb-3 border-b border-border">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" /> Ruta de exportación
            </p>
            <div className="flex gap-1">
              <Input
                type="text"
                value={exportDir}
                onChange={(e) => setExportDir(e.target.value)}
                placeholder="C:\\Users\\...\\data"
                className="text-[10px] h-7 flex-1"
                data-testid="input-export-path"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={handleUpdateExportPath}
                data-testid="btn-update-path"
              >
                <Save className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">Los CSV se guardarán aquí</p>
          </div>

          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Variables ({selectedIds.length}/5)
          </p>
          {datasetsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {CATEGORY_ORDER.map((cat) => {
                const datasets = datasetsByCategory?.[cat] || [];
                const isOpen = openCategories[cat];
                return (
                  <Collapsible
                    key={cat}
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenCategories((prev) => ({ ...prev, [cat]: open }))
                    }
                  >
                    <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors" data-testid={`category-${cat}`}>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      {CATEGORY_LABELS[cat] || cat}
                      <span className="ml-auto text-[10px] font-normal opacity-50">{datasets.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 ml-2">
                      {datasets.map((ds: SimemDataset) => (
                        <label
                          key={ds.datasetId}
                          className="flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                          data-testid={`dataset-${ds.datasetId}`}
                        >
                          <Checkbox
                            checked={selectedIds.includes(ds.datasetId)}
                            onCheckedChange={() => toggleDataset(ds.datasetId)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium leading-tight">{ds.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{ds.granularity === "hourly" ? "Horario" : "Diario"}</div>
                          </div>
                        </label>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isFetching && (
            <div className="space-y-4">
              {fetchProgress && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <p className="text-sm font-medium text-primary">{fetchProgress}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
              <Skeleton className="h-[350px]" />
            </div>
          )}

          {isSavingToDisk && saveDiskProgress && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <div>
                <p className="text-sm font-medium text-emerald-500">{saveDiskProgress}</p>
                <p className="text-[10px] text-emerald-400/70 mt-0.5">Guardando en: {exportDir || "./exports"}</p>
              </div>
            </div>
          )}

          {savedFiles.length > 0 && !isSavingToDisk && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs font-medium text-emerald-500 mb-2 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> {savedFiles.length} archivos guardados en disco
              </p>
              <div className="space-y-0.5">
                {savedFiles.map((f, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground font-mono">{f}</p>
                ))}
              </div>
            </div>
          )}

          {!isFetching && !hasResults && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20 text-muted-foreground">
              <svg viewBox="0 0 64 64" className="w-16 h-16 mb-4 opacity-30" fill="currentColor">
                <path d="M8 56V16h8v40H8zm16 0V8h8v48H24zm16 0V24h8v32H40zm16 0V32h8v24H56z" />
              </svg>
              <p className="text-sm font-medium">Selecciona variables y un rango de fechas</p>
              <p className="text-xs mt-1">Luego haz clic en "Consultar" para ver los datos</p>
            </div>
          )}

          {!isFetching && hasResults && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {selectedIds.map((dsId, idx) => {
                  const stats = statsPerDataset[dsId];
                  const name = datasetNames[dsId] || dsId;
                  if (!stats) return null;
                  const trend = stats.mean > 0 ? stats.max > stats.mean * 1.1 : false;
                  return (
                    <Card key={dsId} className="relative overflow-hidden" data-testid={`stats-card-${dsId}`}>
                      <div
                        className="absolute top-0 left-0 w-1 h-full"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <CardContent className="p-3 pl-4">
                        <p className="text-[10px] text-muted-foreground font-medium truncate mb-1">{name}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-semibold tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatNumber(stats.mean)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">prom.</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[10px] text-muted-foreground">
                          <span>Mín: <b className="text-foreground tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(stats.min)}</b></span>
                          <span>Máx: <b className="text-foreground tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(stats.max)}</b></span>
                          <span>σ: <b className="text-foreground tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(stats.stddev)}</b></span>
                          <span>n: <b className="text-foreground tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>{stats.count.toLocaleString()}</b></span>
                        </div>
                        <div className="flex justify-end mt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => handleExportCSV(dsId)}
                            data-testid={`btn-export-csv-${dsId}`}
                          >
                            <Download className="w-3 h-3" /> CSV
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Time Series Chart */}
              {chartData.length > 0 && (
                <Card data-testid="chart-container">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Serie de Tiempo</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 pb-2">
                    <div ref={chartRef} className="bg-card rounded-md">
                      <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(v) => {
                              if (!v) return "";
                              const parts = v.split("-");
                              return `${parts[1]}/${parts[2]}`;
                            }}
                            stroke="hsl(var(--border))"
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            stroke="hsl(var(--border))"
                            tickFormatter={(v) => formatNumber(v)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "11px",
                              color: "hsl(var(--foreground))",
                            }}
                            labelFormatter={(label) => `Fecha: ${label}`}
                            formatter={(value: any, name: string) => [
                              typeof value === "number" ? value.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "—",
                              datasetNames[name] || name,
                            ]}
                          />
                          <Legend
                            formatter={(value) => (
                              <span className="text-xs">{datasetNames[value] || value}</span>
                            )}
                          />
                          {selectedIds.map((dsId, idx) => (
                            <Line
                              key={dsId}
                              type="monotone"
                              dataKey={dsId}
                              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                              strokeWidth={1.5}
                              dot={false}
                              connectNulls
                              name={dsId}
                            />
                          ))}
                          <Brush
                            dataKey="date"
                            height={24}
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--card))"
                            tickFormatter={(v) => {
                              if (!v) return "";
                              const parts = v.split("-");
                              return `${parts[1]}/${parts[2]}`;
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Correlation Heatmap */}
              {correlationMatrix && (
                <Card data-testid="correlation-heatmap">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Matriz de Correlación (Pearson)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 overflow-x-auto">
                    <div className="inline-block">
                      <table className="border-collapse">
                        <thead>
                          <tr>
                            <th className="w-28"></th>
                            {correlationMatrix.ids.map((id) => (
                              <th key={id} className="text-[10px] text-muted-foreground font-medium px-2 pb-2 max-w-[80px] truncate" title={datasetNames[id]}>
                                {(datasetNames[id] || id).substring(0, 12)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {correlationMatrix.ids.map((idA) => (
                            <tr key={idA}>
                              <td className="text-[10px] text-muted-foreground font-medium pr-3 truncate max-w-[120px]" title={datasetNames[idA]}>
                                {(datasetNames[idA] || idA).substring(0, 16)}
                              </td>
                              {correlationMatrix.ids.map((idB) => {
                                const val = correlationMatrix.matrix[idA][idB];
                                const absVal = Math.abs(val);
                                const bgColor =
                                  val > 0
                                    ? `rgba(6, 182, 212, ${absVal * 0.6})`
                                    : `rgba(239, 68, 68, ${absVal * 0.6})`;
                                return (
                                  <td
                                    key={idB}
                                    className="w-16 h-10 text-center text-[10px] font-mono rounded-sm border border-border/30"
                                    style={{
                                      backgroundColor: bgColor,
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                    data-testid={`corr-${idA}-${idB}`}
                                  >
                                    {val.toFixed(2)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Data Table */}
              {chartData.length > 0 && (
                <Card data-testid="data-table">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Datos ({chartData.length} registros)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[400px] overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-card z-10">
                          <tr className="border-b border-border">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                            {selectedIds.map((dsId, idx) => (
                              <th key={dsId} className="text-right px-4 py-2 font-medium" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                                {(datasetNames[dsId] || dsId).substring(0, 20)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {chartData.slice(0, 500).map((row: any, i: number) => (
                            <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                              <td className="px-4 py-1.5 text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {row.date}
                              </td>
                              {selectedIds.map((dsId) => (
                                <td key={dsId} className="text-right px-4 py-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {row[dsId] !== null && row[dsId] !== undefined
                                    ? Number(row[dsId]).toLocaleString("es-CO", { maximumFractionDigits: 2 })
                                    : "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {chartData.length > 500 && (
                        <p className="text-[10px] text-center text-muted-foreground py-2">
                          Mostrando primeros 500 de {chartData.length} registros
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
