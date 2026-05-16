import { config } from "./config.js";
import { db, statements } from "./db.js";

const GITHUB_API = "https://api.github.com";

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function repoFromGitHub(item, capturedAt) {
  return {
    id: item.id,
    full_name: item.full_name,
    name: item.name,
    owner: item.owner?.login || item.full_name.split("/")[0],
    description: item.description || "",
    html_url: item.html_url,
    language: item.language || "Unknown",
    topics: JSON.stringify(item.topics || []),
    stargazers_count: item.stargazers_count || 0,
    forks_count: item.forks_count || 0,
    open_issues_count: item.open_issues_count || 0,
    created_at: item.created_at,
    updated_at: item.updated_at,
    pushed_at: item.pushed_at,
    last_seen_at: capturedAt
  };
}

async function githubFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "monitor-github-star-radar"
  };

  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  const response = await fetch(url, { headers });
  const rateLimit = {
    limit: response.headers.get("x-ratelimit-limit"),
    remaining: response.headers.get("x-ratelimit-remaining"),
    reset: response.headers.get("x-ratelimit-reset")
  };

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403 && body.includes("rate limit")) {
      throw new Error("GitHub API 匿名额度已用完，请在 .env 中配置 GITHUB_TOKEN 后重试。");
    }
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 240)}`);
  }

  return { data: await response.json(), rateLimit };
}

async function searchRepositories(query, perPage = 30) {
  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));

  const { data, rateLimit } = await githubFetch(url);
  return { items: data.items || [], rateLimit };
}

export async function refreshTrending() {
  const capturedAt = new Date().toISOString();
  const pushedSince = isoHoursAgo(24 * 30).slice(0, 10);
  const queries = [
    `stars:>50 pushed:>${pushedSince}`,
    ...config.searchLanguages.map((language) => `language:${language} stars:>50 pushed:>${pushedSince}`)
  ];

  const seen = new Set();
  const repos = [];
  let rateLimit = null;

  for (const query of queries) {
    const result = await searchRepositories(query);
    rateLimit = result.rateLimit;

    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      repos.push(item);
    }
  }

  const write = db.transaction((items) => {
    for (const item of items) {
      const repo = repoFromGitHub(item, capturedAt);
      statements.upsertRepo.run(repo);

      const latest = statements.latestSnapshot.get(repo.id);
      if (!latest || latest.stargazers_count !== repo.stargazers_count) {
        statements.insertSnapshot.run(repo.id, repo.stargazers_count, capturedAt);
      }
    }
  });

  write(repos);

  const cutoff = new Date(Date.now() - Math.max(config.snapshotWindowHours, 24) * 3 * 60 * 60 * 1000).toISOString();
  statements.cleanupSnapshots.run(cutoff);

  return {
    capturedAt,
    candidates: repos.length,
    rateLimit
  };
}
