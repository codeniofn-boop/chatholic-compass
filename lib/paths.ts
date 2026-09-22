import path from "node:path";

/**
 * Project paths. Everything lives under <project>/data so that Next.js can trace file access
 * statically (see the `serverExternalPackages` note in next.config.ts).
 */
export const DATA_DIR = path.join(process.cwd(), "data");
export const MODELS_DIR = path.join(DATA_DIR, "models");
export const RAW_DIR = process.env.DATA_RAW_DIR ? path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_RAW_DIR) : path.join(DATA_DIR, "raw");
export const DB_PATH = process.env.DATABASE_PATH ? path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH) : path.join(DATA_DIR, "compass.db");
