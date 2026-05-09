import type { CompetitionCode } from "./competitions";

const BASE = "https://api.football-data.org/v4";

function token(): string {
  const t = process.env.FOOTBALL_DATA_TOKEN;
  if (!t || t === "your_token_here") {
    throw new Error(
      "FOOTBALL_DATA_TOKEN is missing. Put it in .env.local and restart the dev server.",
    );
  }
  return t;
}

// ---------- 自适应限流 ----------
//
// daniel @ football-data.org 提示：必须读响应头做限流，否则免费档 10 req/min 很快被打爆。
// 响应头：
//   X-Requests-Available-Minute   当前一分钟内剩余可用请求数
//   X-RequestCounter-Reset        距离计数器重置还有多少秒
//
// 状态是 module-level（进程内），单 Next.js 实例足够；多实例需要外部存储。

interface ThrottleState {
  available: number;
  resetAt: number; // ms epoch
}

const throttle: ThrottleState = {
  available: Number.POSITIVE_INFINITY,
  resetAt: 0,
};

// 同进程串行化，确保 throttle 状态严格按顺序读写，
// 也防止用户在同一刷新里并发打 6 个 standings 时打爆配额。
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

function readThrottleHeaders(headers: Headers) {
  const avail = headers.get("X-Requests-Available-Minute");
  const reset = headers.get("X-RequestCounter-Reset");
  if (avail != null) throttle.available = Number(avail);
  if (reset != null) throttle.resetAt = Date.now() + Number(reset) * 1000;
}

async function waitIfDepleted() {
  if (throttle.available > 0) return;
  const wait = throttle.resetAt - Date.now() + 100;
  if (wait <= 0) return;
  console.warn(`[football-data] depleted, waiting ${wait}ms for reset`);
  await new Promise((r) => setTimeout(r, wait));
  throttle.available = Number.POSITIVE_INFINITY; // 重置后假设满桶，下次请求会更新
}

async function fdGet<T>(path: string): Promise<T> {
  return serialize(async () => {
    await waitIfDepleted();

    const url = `${BASE}${path}`;
    let res = await fetch(url, {
      headers: { "X-Auth-Token": token() },
    });
    readThrottleHeaders(res.headers);

    if (res.status === 429) {
      const retryAfter = Number(
        res.headers.get("Retry-After") ??
          res.headers.get("X-RequestCounter-Reset") ??
          60,
      );
      console.warn(`[football-data] 429 on ${path}, sleeping ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000 + 100));
      res = await fetch(url, {
        headers: { "X-Auth-Token": token() },
      });
      readThrottleHeaders(res.headers);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `football-data ${res.status} on ${path}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  });
}

// ---------- Match types ----------

export interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

export interface FdScoreSide {
  home: number | null;
  away: number | null;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "POSTPONED"
    | "SUSPENDED"
    | "CANCELLED";
  matchday?: number;
  stage?: string;
  group?: string | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  competition: { code: string; name: string; emblem?: string };
  score: { fullTime: FdScoreSide; halfTime: FdScoreSide };
}

export interface FdMatchesResponse {
  count: number;
  matches: FdMatch[];
}

// matches 也做 60 秒短缓存。不太短（避免短时间内反复点也打远程），不太长（比赛进行中能较快看到比分）。
const MATCHES_TTL_MS = 60 * 1000;
const matchesCache = new Map<string, { at: number; data: FdMatch[] }>();

export async function getMatches(opts: {
  competitions: CompetitionCode[];
  dateFrom: string;
  dateTo: string;
}): Promise<FdMatch[]> {
  const params = new URLSearchParams({
    competitions: opts.competitions.join(","),
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });
  const key = params.toString();
  const cached = matchesCache.get(key);
  if (cached && Date.now() - cached.at < MATCHES_TTL_MS) {
    return cached.data;
  }
  const data = await fdGet<FdMatchesResponse>(`/matches?${params}`);
  matchesCache.set(key, { at: Date.now(), data: data.matches });
  return data.matches;
}

// ---------- Standings types ----------

export interface FdStandingRow {
  position: number;
  team: FdTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FdStandingTable {
  stage: string;
  type: "TOTAL" | "HOME" | "AWAY";
  group?: string | null;
  table: FdStandingRow[];
}

export interface FdStandingsResponse {
  competition: { code: string; name: string };
  season: { startDate: string; endDate: string };
  standings: FdStandingTable[];
}

// 进程内 standings 缓存。Next.js dev 模式下 fetch cache 不一定生效，
// 排名一小时内变化极小，自己缓存 1 小时既省限额、又快。
const STANDINGS_TTL_MS = 60 * 60 * 1000;
const standingsCache = new Map<
  string,
  { at: number; data: FdStandingsResponse }
>();

export async function getStandings(
  competition: CompetitionCode,
): Promise<FdStandingsResponse> {
  const cached = standingsCache.get(competition);
  if (cached && Date.now() - cached.at < STANDINGS_TTL_MS) {
    return cached.data;
  }
  const data = await fdGet<FdStandingsResponse>(
    `/competitions/${competition}/standings`,
  );
  standingsCache.set(competition, { at: Date.now(), data });
  return data;
}

/**
 * 把 standings 拍平为 teamId -> position（在 TOTAL 表里的位置）。
 * 五大联赛只有一张 TOTAL 表，欧冠新赛制也是单一大表（36 队 league phase）。
 */
export function buildTeamRank(
  resp: FdStandingsResponse,
): Map<number, number> {
  const rank = new Map<number, number>();
  for (const t of resp.standings) {
    if (t.type !== "TOTAL") continue;
    for (const row of t.table) {
      if (!rank.has(row.team.id)) {
        rank.set(row.team.id, row.position);
      }
    }
  }
  return rank;
}

// ---------- Team recent matches (for form 战绩) ----------

interface FdTeamMatchesResponse {
  matches: FdMatch[];
}

/**
 * 拉某球队最近 N 场已结束比赛。football-data.org 该端点付费，但免费档也能用，
 * 只是会受限。limit 默认 5。
 */
export async function getTeamRecentMatches(
  teamId: number,
  limit = 5,
): Promise<FdMatch[]> {
  const params = new URLSearchParams({
    status: "FINISHED",
    limit: String(limit),
  });
  const data = await fdGet<FdTeamMatchesResponse>(
    `/teams/${teamId}/matches?${params}`,
  );
  // API 默认按时间降序返回；保险起见再 sort 一次（最近场在最前）
  return data.matches
    .slice()
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, limit);
}

/**
 * 把最近比赛序列转成 W/D/L 字符串。
 * 时间正序：最早的在最左，最近的在最右（更符合阅读习惯）。
 * 只能从该球队视角判断输赢，所以需要传 teamId。
 */
export function matchesToForm(teamId: number, matches: FdMatch[]): string {
  return matches
    .slice()
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate)) // 旧 → 新
    .map((m) => {
      const isHome = m.homeTeam.id === teamId;
      const me = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const opp = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      if (me == null || opp == null) return "?";
      if (me > opp) return "W";
      if (me < opp) return "L";
      return "D";
    })
    .join("");
}
