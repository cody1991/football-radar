import type { CompetitionCode } from "./competitions";
import { findDerby, type Derby } from "./derbies";
import type { FdMatch } from "./football-data";

export interface RankInfo {
  home: number | null;
  away: number | null;
}

export interface ScoredMatch {
  match: FdMatch;
  rank: RankInfo;
  derby: Derby | null;
  score: number;
  reasons: string[];
  worthWatching: boolean;
}

/** 一场比赛展示用的"左右顺序"：排名靠前的放左，未上榜的视为大序号。 */
export interface ArrangedMatch {
  leftTeamId: number;
  leftTeamName: string;
  leftTeamCrest: string | null | undefined;
  leftRank: number | null;
  leftScore: number | null;
  rightTeamId: number;
  rightTeamName: string;
  rightTeamCrest: string | null | undefined;
  rightRank: number | null;
  rightScore: number | null;
  /** true 表示左侧是主队；false 表示左侧是客队（即两队顺序被换过） */
  leftIsHome: boolean;
}

export function arrangeMatch(item: ScoredMatch): ArrangedMatch {
  const { match, rank } = item;
  const hp = rank.home ?? Number.POSITIVE_INFINITY;
  const ap = rank.away ?? Number.POSITIVE_INFINITY;
  const homeIsLeft = hp <= ap;
  const left = homeIsLeft ? match.homeTeam : match.awayTeam;
  const right = homeIsLeft ? match.awayTeam : match.homeTeam;
  return {
    leftTeamId: left.id,
    leftTeamName: left.name,
    leftTeamCrest: left.crest,
    leftRank: homeIsLeft ? rank.home : rank.away,
    leftScore: homeIsLeft ? match.score.fullTime.home : match.score.fullTime.away,
    rightTeamId: right.id,
    rightTeamName: right.name,
    rightTeamCrest: right.crest,
    rightRank: homeIsLeft ? rank.away : rank.home,
    rightScore: homeIsLeft ? match.score.fullTime.away : match.score.fullTime.home,
    leftIsHome: homeIsLeft,
  };
}

export interface ScoringConfig {
  topN: number;
  /**
   * "either"  : 任一方在 Top N 即算入选
   * "both"    : 双方都需要在 Top N
   */
  topMode: "either" | "both";
  includeDerbies: boolean;
}

export const DEFAULT_CONFIG: ScoringConfig = {
  topN: 8,
  topMode: "either",
  includeDerbies: true,
};

export function scoreMatch(
  match: FdMatch,
  rankByTeam: Map<number, number>,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): ScoredMatch {
  const homePos = rankByTeam.get(match.homeTeam.id) ?? null;
  const awayPos = rankByTeam.get(match.awayTeam.id) ?? null;

  const derby = findDerby(
    match.competition.code as CompetitionCode,
    match.homeTeam.name,
    match.awayTeam.name,
  );

  const reasons: string[] = [];
  let score = 0;

  // 排名分：越靠前分越高
  const posScore = (p: number | null) =>
    p == null ? 0 : Math.max(0, 21 - p); // 第 1 名得 20，第 20 名得 1
  score += posScore(homePos);
  score += posScore(awayPos);

  const homeInTop = homePos != null && homePos <= cfg.topN;
  const awayInTop = awayPos != null && awayPos <= cfg.topN;

  // 强强对话加成
  if (homeInTop && awayInTop) {
    score += 30;
    reasons.push(`双方都在前 ${cfg.topN}`);
  } else if (homeInTop || awayInTop) {
    score += 10;
    reasons.push(`一方在前 ${cfg.topN}`);
  }

  // 德比
  if (derby && cfg.includeDerbies) {
    score += 25;
    reasons.push(`德比：${derby.name}`);
  }

  // 联赛权重：欧冠 > 五大联赛
  if (match.competition.code === "CL") score += 8;

  const meetsTop =
    cfg.topMode === "both" ? homeInTop && awayInTop : homeInTop || awayInTop;
  const worthWatching = meetsTop || (cfg.includeDerbies && !!derby);

  return {
    match,
    rank: { home: homePos, away: awayPos },
    derby,
    score,
    reasons,
    worthWatching,
  };
}
