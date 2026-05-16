import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4317),
  githubToken: process.env.GITHUB_TOKEN || "",
  refreshCron: process.env.REFRESH_CRON || "*/30 * * * *",
  snapshotWindowHours: Number(process.env.SNAPSHOT_WINDOW_HOURS || 24),
  minStars: Number(process.env.MIN_STARS || 500),
  searchLanguages: (process.env.SEARCH_LANGUAGES ||
    "javascript,typescript,python,go,rust,java,cpp,php,ruby,swift,kotlin")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
};
