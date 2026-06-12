import { AVAILABLE_CODES, type CompetitionCode } from "../competitions";
import { setMeta, upsertMatches, upsertStandings } from "../db";
import {
  buildTeamRank,
  getMatches,
  getStandings,
  type FdMatch,
  type FdStandingRow,
} from "../football-data";
import type { MatchRow, StandingRow } from "../types";

function addDaysIso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function fdMatchToRow(m: FdMatch, now: number): MatchRow {
  return {
    id: m.id,
    utcDate: m.utcDate,
    competitionCode: m.competition.code as CompetitionCode,
    competitionName: m.competition.name,
    status: m.status,
    homeTeamId: m.homeTeam.id,
    homeTeamName: m.homeTeam.name,
    homeTeamCrest: m.homeTeam.crest ?? null,
    awayTeamId: m.awayTeam.id,
    awayTeamName: m.awayTeam.name,
    awayTeamCrest: m.awayTeam.crest ?? null,
    fullTimeHome: m.score.fullTime.home,
    fullTimeAway: m.score.fullTime.away,
    matchday: m.matchday ?? null,
    stage: m.stage ?? null,
    updatedAt: now,
  };
}

function rankRowsFor(
  comp: CompetitionCode,
  rows: FdStandingRow[],
  now: number,
): StandingRow[] {
  return rows.map((r) => ({
    competitionCode: comp,
    teamId: r.team.id,
    teamName: r.team.name,
    position: r.position,
    points: r.points,
    playedGames: r.playedGames,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    updatedAt: now,
  }));
}

export interface RefreshOptions {
  /** 拉今天起多少天的赛程（含今天）。默认 8（覆盖周末预告需要的范围）。 */
  daysAhead?: number;
  /** 要拉的联赛，默认是全部可用联赛。 */
  competitions?: CompetitionCode[];
}

export interface RefreshResult {
  matchesUpserted: number;
  standingsUpserted: number;
  competitions: CompetitionCode[];
  from: string;
  to: string;
  durationMs: number;
}

/**
 * 拉一次远程数据并写入 SQLite。
 * scheduler 一般每天调一次（早 07:30）；进行中比赛时可以每 5–10 分钟再叠加调一次。
 */
export async function refreshData(
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const start = Date.now();
  const competitions = opts.competitions ?? AVAILABLE_CODES;
  const from = addDaysIso(0);
  const to = addDaysIso(opts.daysAhead ?? 8);

  // 1) 排名
  let standingsCount = 0;
  for (const c of competitions) {
    try {
      const resp = await getStandings(c);
      const flatRank = buildTeamRank(resp);
      // 取 TOTAL 表的原始行
      const totalTables = resp.standings.filter((t) => t.type === "TOTAL");
      for (const totalTable of totalTables) {
        const rows = rankRowsFor(c, totalTable.table, start);
        upsertStandings(rows);
        standingsCount += rows.length;
      }
      void flatRank;
    } catch (e) {
      console.warn(`[refresh] standings failed for ${c}:`, e);
    }
  }

  // 2) 赛程
  let matchesCount = 0;
  try {
    const matches = await getMatches({
      competitions,
      dateFrom: from,
      dateTo: to,
    });
    const rows = matches.map((m) => fdMatchToRow(m, start));
    upsertMatches(rows);
    matchesCount = rows.length;
  } catch (e) {
    console.warn(`[refresh] matches failed:`, e);
  }

  setMeta("last_refresh_at", String(start));
  setMeta(
    "last_refresh_summary",
    JSON.stringify({
      from,
      to,
      competitions,
      matchesCount,
      standingsCount,
    }),
  );

  return {
    matchesUpserted: matchesCount,
    standingsUpserted: standingsCount,
    competitions,
    from,
    to,
    durationMs: Date.now() - start,
  };
}
