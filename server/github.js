import { config } from "./config.js";
import { db, statements } from "./db.js";
import { getConfiguredGroups } from "./groups.js";

const GITHUB_API = "https://api.github.com";

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(days) {
  return isoHoursAgo(days * 24).slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      throw new Error("GitHub API rate limit exceeded. Configure GITHUB_TOKEN and retry.");
    }
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 240)}`);
  }

  return { data: await response.json(), rateLimit };
}

async function searchRepositories(query, { perPage = 30, sort = "stars", pool = "unknown" } = {}) {
  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));

  const { data, rateLimit } = await githubFetch(url);
  return { items: data.items || [], rateLimit, pool, totalCount: data.total_count || 0 };
}

function hasQualifier(query, qualifier) {
  return new RegExp(`(^|\\s)${qualifier}:`, "i").test(query);
}

function withDefaultQualifiers(query, { minStars, since }) {
  const parts = [query.trim()];
  if (!hasQualifier(query, "stars")) {
    parts.push(`stars:>=${minStars}`);
  }
  if (!hasQualifier(query, "pushed") && !hasQualifier(query, "created")) {
    parts.push(`pushed:>${since}`);
  }
  return parts.join(" ");
}

function buildGlobalQueries(group) {
  const recentSince = isoDaysAgo(config.recentWindowDays);
  const activeSince = isoDaysAgo(config.activeWindowDays);
  const baselineStars = `stars:>=${config.baselineMinStars}`;
  const discoveryStars = `stars:>=${config.discoveryMinStars}`;
  return [
    {
      groupId: group.id,
      pool: "baseline-stars",
      query: `${baselineStars} pushed:>${recentSince}`,
      sort: "stars",
      perPage: 40
    },
    {
      groupId: group.id,
      pool: "recent-created",
      query: `${discoveryStars} created:>${recentSince}`,
      sort: "stars",
      perPage: 40
    },
    {
      groupId: group.id,
      pool: "recent-active",
      query: `${discoveryStars} pushed:>${activeSince}`,
      sort: "updated",
      perPage: 40
    },
    ...config.searchLanguages.map((language) => ({
      groupId: group.id,
      pool: `language:${language}`,
      query: `language:${language} ${discoveryStars} pushed:>${activeSince}`,
      sort: "updated",
      perPage: 25
    })),
    ...config.searchTopics.flatMap((topic) => [
      {
        groupId: group.id,
        pool: `topic:${topic}`,
        query: `topic:${topic} ${discoveryStars} pushed:>${recentSince}`,
        sort: "updated",
        perPage: 25
      },
      {
        groupId: group.id,
        pool: `keyword:${topic}`,
        query: `${topic} in:name,description,readme ${discoveryStars} pushed:>${recentSince}`,
        sort: "updated",
        perPage: 20
      }
    ])
  ];
}

function buildFocusedQueries(group) {
  const activeSince = isoDaysAgo(config.activeWindowDays);
  return (group.queries || []).map((entry, index) => {
    const candidate = typeof entry === "string" ? { query: entry } : entry;
    return {
      groupId: group.id,
      pool: candidate.pool || `${group.id}:${index + 1}`,
      query: withDefaultQualifiers(candidate.query, {
        minStars: candidate.minStars || config.discoveryMinStars,
        since: candidate.since || activeSince
      }),
      sort: candidate.sort || "updated",
      perPage: candidate.perPage || 25
    };
  });
}

function buildCandidateQueries() {
  return getConfiguredGroups().flatMap((group) => {
    if (group.mode === "global") {
      return buildGlobalQueries(group);
    }
    return buildFocusedQueries(group);
  });
}

export async function refreshTrending() {
  const capturedAt = new Date().toISOString();
  const queries = buildCandidateQueries();

  const seenByGroup = new Set();
  const poolStats = [];
  const repos = new Map();
  const repoGroups = new Map();
  let rateLimit = null;

  for (const candidate of queries) {
    const result = await searchRepositories(candidate.query, candidate);
    rateLimit = result.rateLimit;
    let added = 0;

    for (const item of result.items) {
      repos.set(item.id, item);

      const groupKey = `${candidate.groupId}:${item.id}`;
      if (!repoGroups.has(item.id)) {
        repoGroups.set(item.id, new Map());
      }
      if (!repoGroups.get(item.id).has(candidate.groupId)) {
        repoGroups.get(item.id).set(candidate.groupId, new Set());
      }
      repoGroups.get(item.id).get(candidate.groupId).add(candidate.pool);

      if (!seenByGroup.has(groupKey)) {
        seenByGroup.add(groupKey);
        added += 1;
      }
    }

    poolStats.push({
      groupId: candidate.groupId,
      pool: candidate.pool,
      query: candidate.query,
      sort: candidate.sort,
      returned: result.items.length,
      added,
      totalCount: result.totalCount
    });

    if (config.searchDelayMs > 0) {
      await sleep(config.searchDelayMs);
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

      for (const [groupId, pools] of repoGroups.get(repo.id) || []) {
        statements.upsertRepoGroup.run(repo.id, groupId, JSON.stringify([...pools]), capturedAt);
      }
    }
  });

  write([...repos.values()]);

  const cutoff = new Date(Date.now() - Math.max(config.snapshotWindowHours, 24) * 3 * 60 * 60 * 1000).toISOString();
  statements.cleanupSnapshots.run(cutoff);
  statements.cleanupRepoGroups.run(cutoff);

  return {
    capturedAt,
    candidates: repos.size,
    baselineMinStars: config.baselineMinStars,
    discoveryMinStars: config.discoveryMinStars,
    groups: getConfiguredGroups().map(({ id, name, mode = "focused" }) => ({ id, name, mode })),
    pools: poolStats,
    rateLimit
  };
}
