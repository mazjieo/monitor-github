# GitHub Star Radar

一个用于监测 GitHub 上升星速度最快项目的 Astro + React 静态应用。

## 功能

- 定时抓取 GitHub Search API 中近期活跃且有一定星标量的仓库
- 默认只扫描和展示 `1000` stars 以上的仓库
- 保存每个仓库的星标快照，用观察窗口内的星标增量计算 `stars/hour`
- 首次运行没有历史快照时，使用“创建以来平均星速”作为冷启动排序
- 提供语言筛选、关键词搜索、观察窗口切换和手动刷新
- 支持 GitHub Actions 定时刷新数据，并通过 GitHub Pages 静态展示
- 使用 Astro 生成静态 HTML，React island 负责筛选、搜索和自动刷新

## 运行

```bash
npm install
npm run dev
```

前端地址：`http://127.0.0.1:5173`

后端地址：`http://127.0.0.1:4317`

## 架构

```text
GitHub Actions -> GitHub API -> SQLite snapshots
                          -> public/data/trending.json
Astro build -> static HTML + React interactive island
GitHub Pages -> public website
```

## 配置

复制 `.env.example` 为 `.env` 后可配置：

```bash
GITHUB_TOKEN=ghp_xxx
REFRESH_CRON=*/30 * * * *
SNAPSHOT_WINDOW_HOURS=168
MIN_STARS=1000
```

监控分组在 `config/groups.json` 中维护。新增分组时添加一个 `groups[]` 配置项即可，不需要改采集代码：

```json
{
  "id": "robotics",
  "name": "机器人",
  "description": "机器人、ROS、SLAM、仿真和具身智能。",
  "queries": [
    { "query": "topic:robotics", "sort": "updated" },
    { "query": "\"robotics\" in:name,description,readme", "sort": "updated" }
  ]
}
```

`综合` 分组保留全 GitHub 兜底扫描，`全部关注` 会聚合除 `综合` 之外的所有关注分组。

建议配置 `GITHUB_TOKEN`，未配置时 GitHub API 匿名额度较低。

## 常用命令

```bash
npm run refresh
npm run build
npm start
```

## GitHub Actions + Pages 部署

这个仓库包含两个工作流：

- `.github/workflows/refresh-data.yml`：每小时第 17 和 47 分钟刷新数据，提交 `data/github-trends.sqlite` 和 `public/data/trending.json`
- `.github/workflows/deploy-pages.yml`：每次推送到 `main` 后构建并部署 GitHub Pages

你需要在 GitHub 仓库里配置 Secret：

```text
MONITOR_GITHUB_TOKEN=你的 GitHub token
```

路径：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

然后到：

```text
Settings -> Pages -> Build and deployment -> Source
```

选择：

```text
GitHub Actions
```

第一次可以手动运行 `Refresh GitHub trend data` 工作流生成最新数据。
