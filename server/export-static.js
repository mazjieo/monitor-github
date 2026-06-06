import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { getLanguages, getTrending, getTrendGroups, rankingModes } from "./trending.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "data");
const outputFile = path.join(outputDir, "trending.json");
const windows = [6, 24, 72, 168];
const staticRankingLimit = 80;

export function exportStaticData(refreshResult = null) {
  fs.mkdirSync(outputDir, { recursive: true });
  const groups = getTrendGroups();
  const groupWindows = Object.fromEntries(
    groups.map((group) => [
      group.id,
      Object.fromEntries(
        windows.map((windowHours) => [
          String(windowHours),
          getTrending({
            group: group.id,
            windowHours,
            limit: staticRankingLimit
          })
        ])
      )
    ])
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    refresh: refreshResult,
    groups,
    rankingModes,
    languages: getLanguages({ group: "watch" }),
    groupLanguages: Object.fromEntries(groups.map((group) => [group.id, getLanguages({ group: group.id })])),
    groupWindows,
    windows: groupWindows.watch
  };

  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  db.pragma("wal_checkpoint(TRUNCATE)");

  return {
    outputFile,
    groups: groups.length,
    windows: windows.length,
    rankingModes: rankingModes.length,
    languages: payload.languages.length
  };
}
