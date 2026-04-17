import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const simemDatasets = sqliteTable("simem_datasets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  datasetId: text("dataset_id").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(), // precio | demanda | generacion | hidrologia
  granularity: text("granularity").notNull(), // hourly | daily
  description: text("description").notNull(),
});

export const cachedQueries = sqliteTable("cached_queries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  datasetId: text("dataset_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  data: text("data").notNull(), // JSON stringified
  fetchedAt: text("fetched_at").notNull(),
});

export const presets = sqliteTable("presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  datasetIds: text("dataset_ids").notNull(), // JSON array of strings
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertDatasetSchema = createInsertSchema(simemDatasets).omit({ id: true });
export const insertCachedQuerySchema = createInsertSchema(cachedQueries).omit({ id: true });
export const insertPresetSchema = createInsertSchema(presets).omit({ id: true, createdAt: true });

export type SimemDataset = typeof simemDatasets.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type CachedQuery = typeof cachedQueries.$inferSelect;
export type InsertCachedQuery = z.infer<typeof insertCachedQuerySchema>;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;
