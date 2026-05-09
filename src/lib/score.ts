import type { CompetitionCode } from "./competitions";
import type { RankLookup } from "./db";
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
  /** 入选方式 A：双方都至少在这个排名内（强强对话） */
  bothInTop: number;
  /** 入选方式 B：至少一方在这个排名内（豪门坐镇，对手不挑）。设 null 关闭 */
  superInTop: number | null;
  /** 是否把传统德比当 fallback 入选（无视排名） */
  includeDerbies: boolean;
}

export const DEFAULT_CONFIG: ScoringConfig = {
  bothInTop: 8,
  superInTop: 3,
  includeDerbies: false,
};

/**
 * 兼容 Map<teamId, position> 的旧写法和新的 RankLookup（按联赛分桶）。
 * 推荐传 RankLookup（来自 makeRankLookup），更准确。
 */
type RankSource = RankLookup | Map<number, number>;

function asLookup(src: RankSource): RankLookup {
  if (typeof src === "function") return src;
  return (teamId) => src.get(teamId) ?? null;
}

export function scoreMatch(
  match: FdMatch,
  rankSource: RankSource,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): ScoredMatch {
  const lookup = asLookup(rankSource);
  const code = match.competition.code as CompetitionCode;
  const homePos = lookup(match.homeTeam.id, code);
  const awayPos = lookup(match.awayTeam.id, code);

  const derby = findDerby(code, match.homeTeam.name, match.awayTeam.name);

  const reasons: string[] = [];
  let score = 0;

  // 排名分：越靠前分越高（仅用于 score 排序）
  const posScore = (p: number | null) =>
    p == null ? 0 : Math.max(0, 21 - p); // 第 1 名得 20，第 20 名得 1
  score += posScore(homePos);
  score += posScore(awayPos);

  const inN = (p: number | null, n: number) => p != null && p <= n;
  const ruleBoth =
    inN(homePos, cfg.bothInTop) && inN(awayPos, cfg.bothInTop);
  const ruleSuper =
    cfg.superInTop != null &&
    (inN(homePos, cfg.superInTop) || inN(awayPos, cfg.superInTop));
  const meetsRank = ruleBoth || ruleSuper;

  if (ruleBoth) {
    score += 30;
    reasons.push(`双方 Top ${cfg.bothInTop}`);
  }
  if (ruleSuper) {
    score += 25;
    reasons.push(`豪门坐镇 (Top ${cfg.superInTop})`);
  }

  // 德比仅作为 fallback 入选（当 includeDerbies=true 时无视排名）
  if (derby && cfg.includeDerbies) {
    score += 25;
    if (!meetsRank) reasons.push(`德比：${derby.name}`);
    else reasons.push(`🔥 ${derby.name}`);
  }

  // 联赛权重：欧冠 > 五大联赛
  if (code === "CL") score += 8;

  const worthWatching = meetsRank || (cfg.includeDerbies && !!derby);

  return {
    match,
    rank: { home: homePos, away: awayPos },
    derby,
    score,
    reasons,
    worthWatching,
  };
}
