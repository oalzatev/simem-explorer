import {
  type SimemDataset,
  type InsertDataset,
  type CachedQuery,
  type InsertCachedQuery,
  type Preset,
  type InsertPreset,
  simemDatasets,
  cachedQueries,
  presets,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Datasets
  getAllDatasets(): SimemDataset[];
  getDatasetByDatasetId(datasetId: string): SimemDataset | undefined;
  upsertDataset(dataset: InsertDataset): SimemDataset;

  // Cached Queries
  getCachedQuery(datasetId: string, startDate: string, endDate: string): CachedQuery | undefined;
  insertCachedQuery(query: InsertCachedQuery): CachedQuery;

  // Presets
  getAllPresets(): Preset[];
  getPreset(id: number): Preset | undefined;
  createPreset(preset: InsertPreset): Preset;
  deletePreset(id: number): void;
}

export class DatabaseStorage implements IStorage {
  getAllDatasets(): SimemDataset[] {
    return db.select().from(simemDatasets).all();
  }

  getDatasetByDatasetId(datasetId: string): SimemDataset | undefined {
    return db.select().from(simemDatasets).where(eq(simemDatasets.datasetId, datasetId)).get();
  }

  upsertDataset(dataset: InsertDataset): SimemDataset {
    const existing = this.getDatasetByDatasetId(dataset.datasetId);
    if (existing) return existing;
    return db.insert(simemDatasets).values(dataset).returning().get();
  }

  getCachedQuery(datasetId: string, startDate: string, endDate: string): CachedQuery | undefined {
    return db
      .select()
      .from(cachedQueries)
      .where(
        and(
          eq(cachedQueries.datasetId, datasetId),
          eq(cachedQueries.startDate, startDate),
          eq(cachedQueries.endDate, endDate)
        )
      )
      .get();
  }

  insertCachedQuery(query: InsertCachedQuery): CachedQuery {
    return db.insert(cachedQueries).values(query).returning().get();
  }

  getAllPresets(): Preset[] {
    return db.select().from(presets).all();
  }

  getPreset(id: number): Preset | undefined {
    return db.select().from(presets).where(eq(presets.id, id)).get();
  }

  createPreset(preset: InsertPreset): Preset {
    return db
      .insert(presets)
      .values({ ...preset, createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  deletePreset(id: number): void {
    db.delete(presets).where(eq(presets.id, id)).run();
  }
}

export const storage = new DatabaseStorage();

// Seed datasets
const SEED_DATASETS: InsertDataset[] = [
  // === PROYECTO ML: Variables seleccionadas ===
  // PRECIOS
  { datasetId: "96D56E", name: "Precio de Bolsa Ponderado", category: "precio", granularity: "daily", description: "TARGET - Precio ponderado diario de la energía en bolsa (PPBO)" },
  { datasetId: "03ba47", name: "Máximo Precio Ofertado", category: "precio", granularity: "hourly", description: "MPO Nacional - Estrategia de oferta de generadores (promedio + máximo diario)" },
  { datasetId: "43D616", name: "Precio de Escasez Ponderado", category: "precio", granularity: "daily", description: "Techo regulatorio del mercado" },
  // DEMANDA
  { datasetId: "d55202", name: "Demanda Comercial", category: "demanda", granularity: "hourly", description: "Demanda total del sistema (total, max, min, promedio, pico 18-21h)" },
  // GENERACIÓN
  { datasetId: "E17D25", name: "Generación Real por Tipo", category: "generacion", granularity: "daily", description: "Generación por tipo: Hidro, Térmica, Solar, Eólica + ratio hidro" },
  // HIDROLOGÍA
  { datasetId: "BA1C55", name: "Aportes Hídricos en Energía", category: "hidrologia", granularity: "daily", description: "Aportes hídricos total nacional en energía (kWh)" },
  { datasetId: "34FFDA", name: "Aportes Hídricos en %", category: "hidrologia", granularity: "daily", description: "Aportes vs media histórica - captura El Niño/La Niña" },
  { datasetId: "843497", name: "Reservas Hidráulicas en %", category: "hidrologia", granularity: "daily", description: "Nivel de embalses como % de capacidad útil - señal de riesgo de escasez" },
];

for (const ds of SEED_DATASETS) {
  storage.upsertDataset(ds);
}
