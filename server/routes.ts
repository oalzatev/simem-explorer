import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const SIMEM_BASE = "https://www.simem.co/backend-files/api/PublicData";

// Helper: split date range into 31-day chunks (for hourly/daily data)
function splitDateRange(startDate: string, endDate: string, maxDays: number): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) {
      chunkEnd.setTime(end.getTime());
    }
    chunks.push({
      start: current.toISOString().split("T")[0],
      end: chunkEnd.toISOString().split("T")[0],
    });
    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
}

// Helper: fetch a single chunk from SIMEM
async function fetchSimemChunk(datasetId: string, startDate: string, endDate: string): Promise<any[]> {
  const url = `${SIMEM_BASE}?datasetId=${datasetId}&startDate=${startDate}&endDate=${endDate}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error(`SIMEM API error: ${res.status} for ${datasetId}`);
      return [];
    }
    const json = await res.json();
    if (json?.success && json?.result?.records) {
      return json.result.records;
    }
    return [];
  } catch (err) {
    console.error(`SIMEM fetch error for ${datasetId}:`, err);
    return [];
  }
}

// Helper: find date and value fields in records
function normalizeRecords(records: any[]): Array<{ date: string; value: number | null; raw: any }> {
  if (!records || records.length === 0) return [];

  const dateFields = ["FechaHora", "Fecha", "FechaInicio", "fecha", "fechaHora", "Date", "date", "FechaOperacion"];
  const valueFields = ["Value", "Valor", "value", "valor", "Dato", "dato", "Values", "Cantidad"];

  const sampleRecord = records[0];
  const keys = Object.keys(sampleRecord);

  let dateField = dateFields.find((f) => keys.includes(f));
  let valueField = valueFields.find((f) => keys.includes(f));

  if (!dateField) {
    dateField = keys.find((k) => k.toLowerCase().includes("fecha") || k.toLowerCase().includes("date"));
  }
  if (!valueField) {
    valueField = keys.find(
      (k) =>
        k.toLowerCase().includes("valor") ||
        k.toLowerCase().includes("value") ||
        k.toLowerCase().includes("dato") ||
        k.toLowerCase().includes("price") ||
        k.toLowerCase().includes("precio")
    );
  }

  return records.map((r) => ({
    date: dateField ? String(r[dateField]) : "",
    value: valueField ? (r[valueField] !== null && r[valueField] !== undefined ? Number(r[valueField]) : null) : null,
  }));
}

// Smart aggregation rules per dataset
interface AggRule {
  filterField?: string;
  filterValues?: string[];
  aggregation: "avg" | "sum" | "first";
  // For datasets with specific value fields
  valueField?: string;
}

const DATASET_AGG_RULES: Record<string, AggRule> = {
  // Precio Bolsa Ponderado: keep only PPBO (promedio nacional)
  "96D56E": { filterField: "CodigoVariable", filterValues: ["PPBO"], aggregation: "avg" },
  // Max Precio Ofertado: keep only MPO_Nal (nacional)
  "03ba47": { filterField: "CodigoVariable", filterValues: ["MPO_Nal"], aggregation: "avg" },
  // Precio Escasez: single variable, just average
  "43D616": { aggregation: "avg" },
  // Demanda Comercial: sum ALL agents per hour -> extract daily features
  "d55202": { aggregation: "sum" },
  // Generacion Real (old): sum ALL plants
  "055A4D": { aggregation: "sum" },
  // Aportes Hidricos en Energía: keep only Colombia (national total)
  "BA1C55": { filterField: "RegionHidrologica", filterValues: ["Colombia"], aggregation: "sum", valueField: "AportesHidricosEnergia" },
  // Aportes Hidricos en %: keep only Colombia
  "34FFDA": { filterField: "RegionHidrologica", filterValues: ["Colombia"], aggregation: "avg", valueField: "AportesHidricosPorcentaje" },
  // Reservas Hidraulicas en %: average across all reservoirs (weighted)
  "843497": { aggregation: "avg", valueField: "VolumenUtilPorcentaje" },
};

// Special aggregation for Demanda Comercial: sum agents per hour, then extract daily features
function aggregateDemanda(records: any[]): Array<{ date: string; value: number | null; [key: string]: any }> {
  // Step 1: Sum all agents per hour
  const hourlyTotal = new Map<string, number>();
  for (const rec of records) {
    const hora = String(rec.FechaHora || '');
    const val = Number(rec.Valor || 0);
    if (!hora || isNaN(val)) continue;
    hourlyTotal.set(hora, (hourlyTotal.get(hora) || 0) + val);
  }

  // Step 2: Aggregate hourly totals to daily features
  const dailyMap = new Map<string, { sum: number; max: number; min: number; count: number; pico: number; picoCount: number }>();

  for (const [hora, total] of hourlyTotal) {
    const day = hora.split(' ')[0].split('T')[0];
    const hourNum = parseInt(hora.split(' ')[1]?.split(':')[0] || '0');
    const isPico = hourNum >= 18 && hourNum <= 21;

    const existing = dailyMap.get(day);
    if (existing) {
      existing.sum += total;
      existing.max = Math.max(existing.max, total);
      existing.min = Math.min(existing.min, total);
      existing.count += 1;
      if (isPico) { existing.pico += total; existing.picoCount += 1; }
    } else {
      dailyMap.set(day, {
        sum: total, max: total, min: total, count: 1,
        pico: isPico ? total : 0, picoCount: isPico ? 1 : 0
      });
    }
  }

  return Array.from(dailyMap.entries())
    .map(([day, d]) => ({
      date: day,
      value: Math.round(d.sum / d.count),  // promedio horario como valor principal
      demanda_total: Math.round(d.sum),
      demanda_max: Math.round(d.max),
      demanda_min: Math.round(d.min),
      demanda_promedio: Math.round(d.sum / d.count),
      demanda_pico: d.picoCount > 0 ? Math.round(d.pico / d.picoCount) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Special aggregation for Generacion Real y Programada (E17D25): group by TipoGeneracion
function aggregateGeneracion(records: any[]): Array<{ date: string; value: number | null; [key: string]: any }> {
  const dailyMap = new Map<string, { hidro: number; termica: number; solar: number; eolica: number; total: number }>();

  for (const rec of records) {
    const day = String(rec.Fecha || '').split(' ')[0].split('T')[0];
    const tipo = String(rec.TipoGeneracion || '').toLowerCase();
    const gen = Number(rec.GeneracionRealEstimada || 0);
    if (!day || isNaN(gen)) continue;

    if (!dailyMap.has(day)) {
      dailyMap.set(day, { hidro: 0, termica: 0, solar: 0, eolica: 0, total: 0 });
    }
    const d = dailyMap.get(day)!;
    d.total += gen;
    if (tipo.includes('hidra')) d.hidro += gen;
    else if (tipo.includes('termi') || tipo.includes('cogen')) d.termica += gen;
    else if (tipo.includes('solar')) d.solar += gen;
    else if (tipo.includes('eoli')) d.eolica += gen;
  }

  return Array.from(dailyMap.entries())
    .map(([day, d]) => ({
      date: day,
      value: Math.round(d.total),  // total como valor principal para gráfica
      gen_total: Math.round(d.total),
      gen_hidro: Math.round(d.hidro),
      gen_termica: Math.round(d.termica),
      gen_solar: Math.round(d.solar),
      gen_eolica: Math.round(d.eolica),
      ratio_hidro: d.total > 0 ? Math.round((d.hidro / d.total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Special for Max Precio Ofertado: avg AND max per day
function aggregateMaxPrecio(records: any[]): Array<{ date: string; value: number | null; [key: string]: any }> {
  // Filter only MPO_Nal
  const filtered = records.filter(r => r.CodigoVariable === 'MPO_Nal');
  console.log(`  Filter MPO_Nal: ${records.length} -> ${filtered.length}`);

  const dailyMap = new Map<string, { sum: number; max: number; count: number }>();
  for (const rec of filtered) {
    const day = String(rec.FechaHora || '').split(' ')[0].split('T')[0];
    const val = Number(rec.Valor || 0);
    if (!day || isNaN(val)) continue;
    const existing = dailyMap.get(day);
    if (existing) {
      existing.sum += val;
      existing.max = Math.max(existing.max, val);
      existing.count += 1;
    } else {
      dailyMap.set(day, { sum: val, max: val, count: 1 });
    }
  }

  return Array.from(dailyMap.entries())
    .map(([day, d]) => ({
      date: day,
      value: Math.round((d.sum / d.count) * 100) / 100,
      mpo_promedio: Math.round((d.sum / d.count) * 100) / 100,
      mpo_maximo: Math.round(d.max * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Generic filter and aggregate for simple datasets
function smartAggregate(records: any[], datasetId: string, granularity: string): Array<{ date: string; value: number | null; [key: string]: any }> {
  if (!records || records.length === 0) return [];

  // Route to specialized aggregators
  if (datasetId === 'd55202') return aggregateDemanda(records);
  if (datasetId === 'E17D25') return aggregateGeneracion(records);
  if (datasetId === '03ba47') return aggregateMaxPrecio(records);

  const rule = DATASET_AGG_RULES[datasetId] || { aggregation: "avg" };

  // Identify date and value fields
  const dateFields = ["FechaHora", "Fecha", "FechaInicio", "fecha", "fechaHora", "Date", "date", "FechaOperacion"];
  const valueFields = ["Value", "Valor", "value", "valor", "Dato", "dato", "Cantidad"];
  const keys = Object.keys(records[0]);

  let dateField = dateFields.find((f) => keys.includes(f)) ||
    keys.find((k) => k.toLowerCase().includes("fecha") || k.toLowerCase().includes("date"));
  let valueField = rule.valueField || valueFields.find((f) => keys.includes(f)) ||
    keys.find((k) => k.toLowerCase().includes("valor") || k.toLowerCase().includes("value"));

  if (!dateField || !valueField) return [];

  // Filter by sub-variable if needed
  let filtered = records;
  if (rule.filterField && rule.filterValues) {
    filtered = records.filter((r) =>
      rule.filterValues!.includes(String(r[rule.filterField!]))
    );
    console.log(`  Filter ${rule.filterField} in [${rule.filterValues}]: ${records.length} -> ${filtered.length}`);
  }

  // Aggregate to daily
  const dailyMap = new Map<string, { sum: number; count: number }>();

  for (const rec of filtered) {
    const rawDate = String(rec[dateField!]);
    const dayKey = rawDate.split(" ")[0].split("T")[0];
    const val = rec[valueField!];
    if (!dayKey || val === null || val === undefined || isNaN(Number(val))) continue;

    const numVal = Number(val);
    const existing = dailyMap.get(dayKey);
    if (existing) {
      existing.sum += numVal;
      existing.count += 1;
    } else {
      dailyMap.set(dayKey, { sum: numVal, count: 1 });
    }
  }

  return Array.from(dailyMap.entries())
    .map(([day, { sum, count }]) => ({
      date: day,
      value: rule.aggregation === "sum"
        ? Math.round(sum * 100) / 100
        : Math.round((sum / count) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Default export path (can be configured via env or API)
let exportPath = process.env.SIMEM_EXPORT_PATH || path.join(process.cwd(), "exports");

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // GET /api/config — get current export path
  app.get("/api/config", (_req, res) => {
    res.json({ exportPath });
  });

  // POST /api/config — update export path
  app.post("/api/config", (req, res) => {
    const { exportPath: newPath } = req.body;
    if (!newPath || typeof newPath !== "string") {
      return res.status(400).json({ error: "exportPath es requerido" });
    }
    // Validate path exists or create it
    try {
      fs.mkdirSync(newPath, { recursive: true });
      exportPath = newPath;
      console.log(`Export path updated to: ${exportPath}`);
      res.json({ exportPath, success: true });
    } catch (err: any) {
      res.status(400).json({ error: `No se pudo crear la ruta: ${err.message}` });
    }
  });

  // POST /api/datasets/save-to-disk — fetch data and save CSV directly to disk
  app.post("/api/datasets/save-to-disk", async (req, res) => {
    req.socket.setTimeout(600000);
    res.setTimeout(600000);

    const { datasetId, startDate, endDate } = req.body;
    if (!datasetId || !startDate || !endDate) {
      return res.status(400).json({ error: "datasetId, startDate y endDate son requeridos" });
    }

    const ds = storage.getDatasetByDatasetId(datasetId);
    if (!ds) return res.status(404).json({ error: "Dataset no encontrado" });

    // Check cache first
    const cached = storage.getCachedQuery(datasetId, startDate, endDate);
    let dataToSave: any[];

    if (cached) {
      dataToSave = JSON.parse(cached.data);
      console.log(`Using cached data for ${ds.name}: ${dataToSave.length} records`);
    } else {
      const maxDays = ds.granularity === "hourly" || ds.granularity === "daily" ? 31 : 731;
      const chunks = splitDateRange(startDate, endDate, maxDays);
      console.log(`Fetching ${ds.name}: ${chunks.length} chunks`);

      let allRecords: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`  Chunk ${i + 1}/${chunks.length}: ${chunk.start} → ${chunk.end}`);
        const records = await fetchSimemChunk(datasetId, chunk.start, chunk.end);
        allRecords = allRecords.concat(records);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
      }

      dataToSave = smartAggregate(allRecords, datasetId, ds.granularity);

      // Cache aggregated data
      storage.insertCachedQuery({
        datasetId,
        startDate,
        endDate,
        data: JSON.stringify(dataToSave),
        fetchedAt: new Date().toISOString(),
      });
    }

    // Save to disk
    try {
      fs.mkdirSync(exportPath, { recursive: true });
      const safeName = ds.name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, "").replace(/\s+/g, "_");
      const filename = `${safeName}_${startDate}_${endDate}.csv`;
      const filepath = path.join(exportPath, filename);

      let csv: string;
      if (dataToSave.length > 0) {
        const allKeys = Object.keys(dataToSave[0]);
        csv = allKeys.join(',') + '\n';
        for (const r of dataToSave) {
          csv += allKeys.map(k => {
            const val = (r as any)[k];
            return val === null || val === undefined ? '' : typeof val === 'string' ? `"${val}"` : val;
          }).join(',') + '\n';
        }
      } else {
        csv = 'Fecha,Valor\n';
      }

      fs.writeFileSync(filepath, csv, "utf-8");
      console.log(`Saved: ${filepath} (${dataToSave.length} records)`);
      res.json({ success: true, filepath, records: dataToSave.length, filename });
    } catch (err: any) {
      res.status(500).json({ error: `Error al guardar: ${err.message}` });
    }
  });

  // POST /api/datasets/concatenate — merge multiple CSVs into one
  app.post("/api/datasets/concatenate", (req, res) => {
    const { files, outputName } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array es requerido" });
    }

    try {
      let allLines: string[] = [];
      let header = "";

      for (const file of files) {
        const filepath = path.join(exportPath, file);
        if (!fs.existsSync(filepath)) {
          return res.status(404).json({ error: `Archivo no encontrado: ${file}` });
        }
        const content = fs.readFileSync(filepath, "utf-8").trim().split("\n");
        if (!header) {
          header = content[0];
        }
        allLines = allLines.concat(content.slice(1)); // skip header
      }

      const outName = outputName || `concatenado_${Date.now()}.csv`;
      const outPath = path.join(exportPath, outName);
      fs.writeFileSync(outPath, header + "\n" + allLines.join("\n"), "utf-8");

      console.log(`Concatenated ${files.length} files → ${outPath} (${allLines.length} records)`);
      res.json({ success: true, filepath: outPath, records: allLines.length, filename: outName });
    } catch (err: any) {
      res.status(500).json({ error: `Error al concatenar: ${err.message}` });
    }
  });

  // GET /api/datasets — list all datasets grouped by category
  app.get("/api/datasets", (_req, res) => {
    const datasets = storage.getAllDatasets();
    const grouped: Record<string, typeof datasets> = {};
    for (const ds of datasets) {
      if (!grouped[ds.category]) grouped[ds.category] = [];
      grouped[ds.category].push(ds);
    }
    res.json(grouped);
  });

  // GET /api/datasets/:datasetId/data — fetch data with caching
  app.get("/api/datasets/:datasetId/data", async (req, res) => {
    // Increase response timeout for long SIMEM fetches (10 minutes)
    req.socket.setTimeout(600000);
    res.setTimeout(600000);

    const { datasetId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate y endDate son requeridos" });
    }

    const ds = storage.getDatasetByDatasetId(datasetId);
    if (!ds) {
      return res.status(404).json({ error: "Dataset no encontrado" });
    }

    // Check cache
    const cached = storage.getCachedQuery(datasetId, startDate as string, endDate as string);
    if (cached) {
      try {
        const data = JSON.parse(cached.data);
        console.log(`Cache hit for ${ds.name}: ${data.length} records`);
        return res.json({ records: data, cached: true, dataset: ds });
      } catch {
        // Cache corrupt, fall through to fetch
      }
    }

    // Fetch from SIMEM with chunking
    const maxDays = ds.granularity === "hourly" || ds.granularity === "daily" ? 31 : 731;
    const chunks = splitDateRange(startDate as string, endDate as string, maxDays);

    console.log(`Fetching ${ds.name}: ${chunks.length} chunks from ${startDate} to ${endDate}`);

    let allRecords: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`  Chunk ${i + 1}/${chunks.length}: ${chunk.start} → ${chunk.end}`);
      const records = await fetchSimemChunk(datasetId, chunk.start, chunk.end);
      allRecords = allRecords.concat(records);
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    console.log(`  Total raw records from API: ${allRecords.length}`);

    // Smart filter + aggregate to daily values
    const aggregated = smartAggregate(allRecords, datasetId, ds.granularity);
    console.log(`  After smart aggregation: ${aggregated.length} daily records`);

    // Cache the aggregated data (small, fast)
    storage.insertCachedQuery({
      datasetId,
      startDate: startDate as string,
      endDate: endDate as string,
      data: JSON.stringify(aggregated),
      fetchedAt: new Date().toISOString(),
    });

    res.json({ records: aggregated, cached: false, dataset: ds, totalRawRecords: allRecords.length });
  });

  // GET /api/datasets/:datasetId/data/export — export as CSV
  app.get("/api/datasets/:datasetId/data/export", async (req, res) => {
    req.socket.setTimeout(600000);
    res.setTimeout(600000);

    const { datasetId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate y endDate son requeridos" });
    }

    const ds = storage.getDatasetByDatasetId(datasetId);
    if (!ds) {
      return res.status(404).json({ error: "Dataset no encontrado" });
    }

    // Check cache first
    const cached = storage.getCachedQuery(datasetId, startDate as string, endDate as string);
    let records: any[];
    if (cached) {
      records = JSON.parse(cached.data);
    } else {
      const maxDays = ds.granularity === "hourly" || ds.granularity === "daily" ? 31 : 731;
      const chunks = splitDateRange(startDate as string, endDate as string, maxDays);
      let allRecords: any[] = [];
      for (const chunk of chunks) {
        const r = await fetchSimemChunk(datasetId, chunk.start, chunk.end);
        allRecords = allRecords.concat(r);
      }
      records = smartAggregate(allRecords, datasetId, ds.granularity);
    }

    // Build CSV with all available columns
    let csv: string;
    if (records.length > 0) {
      const allKeys = Object.keys(records[0]);
      csv = allKeys.join(',') + '\n';
      for (const r of records) {
        csv += allKeys.map(k => {
          const val = (r as any)[k];
          return val === null || val === undefined ? '' : typeof val === 'string' ? `"${val}"` : val;
        }).join(',') + '\n';
      }
    } else {
      csv = 'Fecha,Valor\n';
    }

    const filename = `${ds.name.replace(/\s+/g, "_")}_${startDate}_${endDate}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  });

  // GET /api/presets
  app.get("/api/presets", (_req, res) => {
    const allPresets = storage.getAllPresets();
    res.json(allPresets);
  });

  // POST /api/presets
  app.post("/api/presets", (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      datasetIds: z.string(), // JSON array string
      startDate: z.string(),
      endDate: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }

    const preset = storage.createPreset(parsed.data);
    res.status(201).json(preset);
  });

  // DELETE /api/presets/:id
  app.delete("/api/presets/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const existing = storage.getPreset(id);
    if (!existing) {
      return res.status(404).json({ error: "Preset no encontrado" });
    }
    storage.deletePreset(id);
    res.json({ success: true });
  });

  return httpServer;
}
