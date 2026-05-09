# Football Radar

按球队排名 + 传统德比筛选「值得看」的足球比赛，**开赛前 30–60 分钟**自动推到 Discord。

数据源：[football-data.org](https://www.football-data.org/) v4 API（个人免费档）。
本地存储：SQLite（`./data/football-radar.db`）。
运行形态：纯 CLI / GitHub Actions 上跑 cron，**没有 web 进程**，零运维。

```
┌── GitHub Actions cron (*/10 min) ──┐
│  checkout main（含历史 SQLite）    │
│  npm ci → npm run schedule:once    │
│    ├─ 距上次 >6h → refresh 远程     │
│    └─ 永远跑：kickoff 扫描          │
│  git commit data/ + push 回 main   │
└────────────────────────────────────┘
                    ↓
              Discord Webhook
       (开赛前 30–60 min 推一次)
```

## 1. 本地开发 / 自检

```bash
# 装依赖
npm install

# 配置环境（.env.local 填两个 token；建议 cp .env.example .env.local 后修改）
#   FOOTBALL_DATA_TOKEN  → https://www.football-data.org/client/register 注册免费拿
#   DISCORD_WEBHOOK_URL  → Discord 频道 → 编辑频道 → 集成 → Webhooks → 新建
#   TZ                   → 推荐 Europe/Amsterdam（影响日期窗口与展示时间）

# 第一次拉数据进 SQLite
npm run push:now -- refresh

# 立刻扫一次即将开赛的比赛（<60min 的会被推到 Discord）
npm run push:now -- kickoff

# 手动测试早报 / 周末预告（已下线自动推送，但仍能手动触发）
npm run push:now -- morning --force
npm run push:now -- weekly --force

# 一条龙自检：refresh + morning + weekly
npm run push:now -- all
```

## 2. GitHub Actions 部署（零服务器、全免费）

Repo 一推，cron 自动跑，没什么需要长期维护。

### 2.1 一次性配置

1. **新建 GitHub repo**（公开 repo Actions 完全免费；私有月 2000 分钟也够）
2. **本地推上去**
   ```bash
   git init && git add . && git commit -m "init football-radar"
   git branch -M main
   git remote add origin git@github.com:<你的用户名>/<repo>.git
   git push -u origin main
   ```
3. **Repository Secrets**（Settings → Secrets and variables → Actions）
   - `FOOTBALL_DATA_TOKEN`
   - `DISCORD_WEBHOOK_URL`
4. **Repository Variable**（同页 Variables tab，可选）
   - `TZ` = `Europe/Amsterdam`（不设默认 Amsterdam）
5. **Workflow permissions** 设为 *Read and write*（让 cron 能 commit `data/` 回 repo）
6. **Actions tab → schedule → Run workflow** 跑一次确认

完了不用再管。每 10 分钟自动 tick。

### 2.2 Trade-off

- **kickoff 提醒精度** ±10–15 分钟：GH Actions cron 触发抖动很正常。`lookaheadMin = 60` 兜底。
- **Repo 会有大量自动 commit**：每天约 144 tick。嫌烦可以：
  - 隔到独立 `data` 分支
  - 或定期 squash
- **GH Actions 配额**（私有 repo）：每次 tick ~30 秒 → ~72 分钟/天 → ~2160 分钟/月，免费档 2000 分钟刚好爆。
  解决：把 repo 改 public（unlimited），或把 cron 改 `*/15 * * * *`。

## 3. 监控范围

| 联赛 | code | 是否启用 |
|---|---|---|
| 英超 Premier League | `PL` | ✅ |
| 西甲 La Liga | `PD` | ✅ |
| 意甲 Serie A | `SA` | ✅ |
| 德甲 Bundesliga | `BL1` | ✅ |
| 法甲 Ligue 1 | `FL1` | ✅ |
| 欧冠 Champions League | `CL` | ✅ |
| 欧联 Europa League | `EL` | ❌ 免费档不含 |

## 4. 含金量 / 筛选规则

`src/lib/score.ts` 里的 `DEFAULT_CONFIG`：

```
bothInTop: 8        入选方式 A：双方都在 Top 8（强强对话）
superInTop: 3       入选方式 B：至少一方在 Top 3（豪门坐镇，对手不挑）
includeDerbies: false
```

入选 = `双方 Top 8` **OR** `任一方 Top 3`（OR 关系，满足任一即推）。

打分公式（仅 score 字段用，不影响是否入选）：

```
总分 =
  (21 - 主队排名)                # 第 1 名 20 分，第 20 名 1 分，未上榜 0
+ (21 - 客队排名)
+ (满足 A：双方 Top 8 ? 30 : 0)
+ (满足 B：一方 Top 3 ? 25 : 0)
+ (传统德比 ? 25 : 0)
+ (欧冠 ? 8 : 0)
```

**Per-league 排名**：同一球队同时在德甲 / 欧冠的，会按比赛所在联赛取对应排名（`makeRankLookup`）。

## 5. Kickoff Alert 长这样

```
⏰ 30 分钟后开赛 · 西甲 · 第 2/3 场
[左队 logo] 巴塞罗那 (#1) · 主
v 皇家马德里 (#2) · 客         [右队 logo]
🔥 国家德比  · 双方都在前 8

开赛时间       含金量
03/15 21:00    83

时间 GMT+1 (Europe/Amsterdam)
```

- **第 2/3 场**：当晚（本地日内）共 3 场命中，这是第 2 场
- 双方队徽：左队 logo 在 author icon、右队 logo 在 thumbnail
- 排名按联赛分别取（同球队在德甲 / 欧冠会显示对应联赛的位置）
- 左右顺序按排名排：排名靠前的在左，所以「主队不一定在左」，主/客有标签

## 6. 关键文件地图

```
football-radar/
├── .env.example              # 环境变量模板
├── .github/workflows/
│   └── schedule.yml          # GH Actions cron（*/10 min）
├── data/                     # SQLite 数据目录（commit 到 repo 用作持久化）
├── scripts/
│   ├── schedule-once.ts      # GH Actions 入口：一次性 tick
│   └── push-now.ts           # CLI：手动触发某 job
└── src/lib/
    ├── football-data.ts      # API client（含自适应限流）
    ├── db.ts                 # SQLite schema + 读写封装 + makeRankLookup
    ├── competitions.ts       # 联赛元数据
    ├── derbies.ts            # 德比清单
    ├── score.ts              # 含金量评分 + arrangeMatch
    ├── team-names-zh.ts      # 中文队名映射
    ├── types.ts
    ├── messaging/
    │   ├── discord.ts        # Discord webhook 客户端
    │   └── format.ts         # 消息模板（kickoff alert 含双队徽）
    └── jobs/
        ├── refresh-data.ts   # 拉远程 → SQLite
        ├── kickoff-alerts.ts # 扫即将开赛 → Discord
        ├── morning-digest.ts # 仅手动
        └── weekly-preview.ts # 仅手动
```

## 7. API 用量预估

football-data.org 个人免费档：**10 req/min**。

| 时机 | 调用 |
|---|---|
| 距上次 >6h 时的 refresh | 6 standings + 1 matches = **7 次** |
| kickoff scan / 推送 | 0（只读 SQLite） |

一天 4 次 refresh ≈ **28 次远程调用**，远低于限额。

## 8. 已知限制

- **欧联（EL）** 免费档不含
- **比分实时推送**：进球/半场/终场未做（用户主动选择关闭）
- **早报 / 周末预告自动触发** 已下线，仅保留 CLI 手动触发
