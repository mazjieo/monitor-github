import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  ArrowUpRight,
  Clock3,
  Code2,
  GitFork,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Zap
} from "lucide-react";
import "./styles.css";

const windows = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 }
];

const numberFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatNumber(value) {
  return numberFmt.format(value || 0);
}

function formatVelocity(value) {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function timeAgo(value) {
  if (!value) return "暂无";
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return dateFmt.format(new Date(value));
}

function useApi(path, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));

    fetch(path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`请求失败：${response.status}`);
        return response.json();
      })
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ data: null, loading: false, error: error.message });
        }
      });

    return () => controller.abort();
  }, deps);

  return state;
}

function useStaticTrending(refreshTick) {
  const staticPath = `${import.meta.env.BASE_URL}data/trending.json?t=${refreshTick}`;
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));

    fetch(staticPath, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("静态数据还没有生成");
        return response.json();
      })
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ data: null, loading: false, error: error.message });
        }
      });

    return () => controller.abort();
  }, [staticPath]);

  return state;
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="stat">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RepoRow({ repo, rank }) {
  const topics = repo.topics?.slice(0, 4) || [];

  return (
    <article className="repo-row">
      <div className="rank">#{rank}</div>
      <div className="repo-main">
        <div className="repo-heading">
          <a href={repo.url} target="_blank" rel="noreferrer">
            <Code2 size={18} />
            <span>{repo.fullName}</span>
            <ArrowUpRight size={15} />
          </a>
          <span className="language">{repo.language || "Unknown"}</span>
        </div>
        <p>{repo.description || "这个仓库暂时没有描述。"}</p>
        <div className="topics">
          {topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      </div>
      <div className="repo-metrics">
        <div className="velocity">
          <Zap size={18} />
          <strong>{formatVelocity(repo.starsPerHour)}</strong>
          <span>stars/h</span>
        </div>
        <div className="metric-line">
          <Star size={15} />
          <span>{formatNumber(repo.stars)}</span>
        </div>
        <div className="metric-line">
          <GitFork size={15} />
          <span>{formatNumber(repo.forks)}</span>
        </div>
        <div className="metric-line">
          <Clock3 size={15} />
          <span>{timeAgo(repo.pushedAt)}</span>
        </div>
        {repo.coldStart ? <span className="cold-start">冷启动估算</span> : <span className="delta">+{repo.starDelta}</span>}
      </div>
    </article>
  );
}

function App() {
  const [windowHours, setWindowHours] = useState(24);
  const [language, setLanguage] = useState("");
  const [query, setQuery] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const trendingPath = `/api/trending?windowHours=${windowHours}&language=${encodeURIComponent(language)}&limit=80&t=${refreshTick}`;
  const staticTrending = useStaticTrending(refreshTick);
  const apiTrending = useApi(trendingPath, [windowHours, language, refreshTick]);
  const apiLanguages = useApi("/api/languages", [refreshTick]);
  const staticWindow = staticTrending.data?.windows?.[String(windowHours)];
  const sourceData = staticWindow || apiTrending.data;
  const loading = staticTrending.loading && apiTrending.loading;
  const error = staticTrending.error && apiTrending.error ? staticTrending.error : "";
  const languages = staticTrending.data?.languages || apiLanguages.data?.items || [];

  const items = useMemo(() => {
    const repos = sourceData?.items || [];
    const byLanguage = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    if (!query.trim()) return byLanguage;
    const needle = query.trim().toLowerCase();
    return byLanguage.filter((repo) => {
      return (
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.description || "").toLowerCase().includes(needle) ||
        (repo.topics || []).some((topic) => topic.toLowerCase().includes(needle))
      );
    });
  }, [sourceData, language, query]);

  const totals = useMemo(() => {
    const repos = sourceData?.items || [];
    const visibleRepos = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    const observed = visibleRepos.filter((repo) => !repo.coldStart).length;
    const top = visibleRepos[0];
    return {
      count: visibleRepos.length,
      observed,
      topVelocity: top ? formatVelocity(top.starsPerHour) : "0",
      topDelta: top ? `+${top.starDelta}` : "+0"
    };
  }, [sourceData, language]);

  async function refreshNow() {
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "刷新失败");
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setRefreshError("公网版本由 GitHub Actions 定时刷新；本地开发时需启动后端 API 才能手动刷新。");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">
            <Sparkles size={16} />
            GitHub Star Radar
          </div>
          <h1>发现升星速度最快的开源项目</h1>
          <p>
            定时抓取 GitHub 候选仓库，保存星标快照，并按观察窗口内的新增星标速度排序。
          </p>
        </div>
        <button className="refresh" onClick={refreshNow} disabled={refreshing}>
          <RefreshCw size={18} className={refreshing ? "spin" : ""} />
          {refreshing ? "刷新中" : "立即刷新"}
        </button>
      </section>

      <section className="toolbar">
        <div className="search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、描述或 topic" />
        </div>
        <div className="segments">
          {windows.map((item) => (
            <button
              key={item.value}
              className={windowHours === item.value ? "active" : ""}
              onClick={() => setWindowHours(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="选择语言">
          <option value="">全部语言</option>
          {languages.map((item) => (
            <option key={item.language} value={item.language}>
              {item.language} ({item.count})
            </option>
          ))}
        </select>
      </section>

      <section className="stats">
        <Stat icon={Code2} label="候选项目" value={totals.count} />
        <Stat icon={Zap} label="最高星速" value={`${totals.topVelocity}/h`} />
        <Stat icon={Star} label="榜首增量" value={totals.topDelta} />
        <Stat icon={Clock3} label="真实快照" value={totals.observed} />
      </section>

      {(error || refreshError) && (
        <div className="alert">
          <AlertCircle size={18} />
          <span>{error || refreshError}</span>
        </div>
      )}

      <section className="list">
        {loading && Array.from({ length: 6 }).map((_, index) => <div className="skeleton" key={index} />)}
        {!loading && items.map((repo, index) => <RepoRow repo={repo} rank={index + 1} key={repo.id} />)}
        {!loading && !items.length && <div className="empty">还没有匹配的仓库。点击立即刷新获取第一批数据。</div>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
