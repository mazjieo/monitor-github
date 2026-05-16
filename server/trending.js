import { db } from "./db.js";
import { config } from "./config.js";

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hoursBetween(a, b) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
}

export function getTrending({ windowHours = 24, language = "", limit = 50 } = {}) {
  const hours = Math.min(Math.max(number(windowHours, 24), 1), 168);
  const maxRows = Math.min(Math.max(number(limit, 50), 1), 100);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const params = { since, language: language || null, limit: maxRows, minStars: config.minStars };

  const rows = db
    .prepare(`
      with recent as (
        select
          repo_id,
          min(captured_at) as first_seen,
          max(captured_at) as last_seen
        from star_snapshots
        where captured_at >= @since
        group by repo_id
      )
      select
        r.*,
        first_snapshot.stargazers_count as first_stars,
        last_snapshot.stargazers_count as last_stars,
        recent.first_seen,
        recent.last_seen,
        (
          select count(*)
          from star_snapshots s
          where s.repo_id = r.id and s.captured_at >= @since
        ) as snapshot_count
      from repositories r
      left join recent on recent.repo_id = r.id
      left join star_snapshots first_snapshot
        on first_snapshot.repo_id = r.id and first_snapshot.captured_at = recent.first_seen
      left join star_snapshots last_snapshot
        on last_snapshot.repo_id = r.id and last_snapshot.captured_at = recent.last_seen
      where r.stargazers_count >= @minStars
        and (@language is null or lower(r.language) = lower(@language))
      order by r.last_seen_at desc
      limit @limit
    `)
    .all(params);

  const items = rows.map((row) => {
    const observedHours = row.first_seen && row.last_seen ? hoursBetween(row.first_seen, row.last_seen) : 0;
    const starDelta = Math.max(0, (row.last_stars || row.stargazers_count) - (row.first_stars || row.stargazers_count));
    const createdHours = Math.max(1, hoursBetween(row.created_at, new Date().toISOString()));
    const observedStarsPerHour = observedHours > 0 ? starDelta / observedHours : 0;
    const coldStartStarsPerHour = row.stargazers_count / createdHours;
    const velocity = observedHours > 0 ? observedStarsPerHour : coldStartStarsPerHour;

    return {
      id: row.id,
      fullName: row.full_name,
      name: row.name,
      owner: row.owner,
      description: row.description,
      url: row.html_url,
      language: row.language,
      topics: JSON.parse(row.topics || "[]"),
      stars: row.stargazers_count,
      forks: row.forks_count,
      openIssues: row.open_issues_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pushedAt: row.pushed_at,
      lastSeenAt: row.last_seen_at,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      snapshotCount: row.snapshot_count || 0,
      starDelta,
      observedHours,
      starsPerHour: velocity,
      coldStart: observedHours === 0
    };
  });

  items.sort((a, b) => b.starsPerHour - a.starsPerHour || b.starDelta - a.starDelta || b.stars - a.stars);

  return {
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    language: language || "all",
    minStars: config.minStars,
    items
  };
}

export function getLanguages() {
  return db
    .prepare(`
      select language, count(*) as count
      from repositories
      where language is not null and language != ''
        and stargazers_count >= ?
      group by language
      order by count desc, language asc
    `)
    .all(config.minStars);
}
