import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { getLanguages, getTrending } from "./trending.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "data");
const outputFile = path.join(outputDir, "trending.json");
const windows = [6, 24, 72, 168];

export function exportStaticData(refreshResult = null) {
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    refresh: refreshResult,
    languages: getLanguages(),
    windows: Object.fromEntries(
      windows.map((windowHours) => [
        String(windowHours),
        getTrending({
          windowHours,
          limit: 100
        })
      ])
    )
  };

  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  db.pragma("wal_checkpoint(TRUNCATE)");

  return {
    outputFile,
    windows: windows.length,
    languages: payload.languages.length
  };
}
