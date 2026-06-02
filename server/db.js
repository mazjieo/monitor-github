import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "github-trends.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  create table if not exists repositories (
    id integer primary key,
    full_name text not null unique,
    name text not null,
    owner text not null,
    description text,
    html_url text not null,
    language text,
    topics text not null default '[]',
    stargazers_count integer not null,
    forks_count integer not null,
    open_issues_count integer not null,
    created_at text not null,
    updated_at text not null,
    pushed_at text not null,
    last_seen_at text not null
  );

  create table if not exists star_snapshots (
    id integer primary key autoincrement,
    repo_id integer not null,
    stargazers_count integer not null,
    captured_at text not null,
    foreign key (repo_id) references repositories(id)
  );

  create table if not exists repo_groups (
    repo_id integer not null,
    group_id text not null,
    matched_by text not null default '[]',
    last_seen_at text not null,
    primary key (repo_id, group_id),
    foreign key (repo_id) references repositories(id)
  );

  create index if not exists idx_snapshots_repo_time
    on star_snapshots(repo_id, captured_at);

  create index if not exists idx_repo_groups_group
    on repo_groups(group_id, repo_id);
`);

export const statements = {
  upsertRepo: db.prepare(`
    insert into repositories (
      id, full_name, name, owner, description, html_url, language, topics,
      stargazers_count, forks_count, open_issues_count, created_at, updated_at,
      pushed_at, last_seen_at
    ) values (
      @id, @full_name, @name, @owner, @description, @html_url, @language, @topics,
      @stargazers_count, @forks_count, @open_issues_count, @created_at, @updated_at,
      @pushed_at, @last_seen_at
    )
    on conflict(id) do update set
      full_name = excluded.full_name,
      name = excluded.name,
      owner = excluded.owner,
      description = excluded.description,
      html_url = excluded.html_url,
      language = excluded.language,
      topics = excluded.topics,
      stargazers_count = excluded.stargazers_count,
      forks_count = excluded.forks_count,
      open_issues_count = excluded.open_issues_count,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      pushed_at = excluded.pushed_at,
      last_seen_at = excluded.last_seen_at
  `),
  insertSnapshot: db.prepare(`
    insert into star_snapshots (repo_id, stargazers_count, captured_at)
    values (?, ?, ?)
  `),
  latestSnapshot: db.prepare(`
    select stargazers_count, captured_at
    from star_snapshots
    where repo_id = ?
    order by captured_at desc
    limit 1
  `),
  upsertRepoGroup: db.prepare(`
    insert into repo_groups (repo_id, group_id, matched_by, last_seen_at)
    values (?, ?, ?, ?)
    on conflict(repo_id, group_id) do update set
      matched_by = excluded.matched_by,
      last_seen_at = excluded.last_seen_at
  `),
  cleanupSnapshots: db.prepare(`
    delete from star_snapshots
    where captured_at < ?
  `),
  cleanupRepoGroups: db.prepare(`
    delete from repo_groups
    where last_seen_at < ?
  `)
};
