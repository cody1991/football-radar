import type { CompetitionCode } from "./competitions";

export interface Derby {
  name: string;
  competition: CompetitionCode;
  teams: [string, string];
}

/**
 * 主流德比清单。匹配按 team.name 子串包含来做（不区分大小写），
 * 因为 football-data.org 给出的英文队名是稳定的。
 */
export const DERBIES: Derby[] = [
  // 英超
  { name: "曼市德比", competition: "PL", teams: ["Manchester United", "Manchester City"] },
  { name: "北伦敦德比", competition: "PL", teams: ["Arsenal", "Tottenham"] },
  { name: "默西塞德德比", competition: "PL", teams: ["Liverpool", "Everton"] },
  { name: "西北德比", competition: "PL", teams: ["Liverpool", "Manchester United"] },
  { name: "伦敦德比·切尔西阿森纳", competition: "PL", teams: ["Chelsea", "Arsenal"] },
  { name: "伦敦德比·切尔西热刺", competition: "PL", teams: ["Chelsea", "Tottenham"] },
  // 西甲
  { name: "国家德比", competition: "PD", teams: ["Real Madrid", "Barcelona"] },
  { name: "马德里德比", competition: "PD", teams: ["Real Madrid", "Atlético"] },
  { name: "加泰德比", competition: "PD", teams: ["Barcelona", "Espanyol"] },
  { name: "塞维利亚德比", competition: "PD", teams: ["Sevilla", "Betis"] },
  // 意甲
  { name: "米兰德比", competition: "SA", teams: ["Inter", "Milan"] },
  { name: "都灵德比", competition: "SA", teams: ["Juventus", "Torino"] },
  { name: "罗马德比", competition: "SA", teams: ["Roma", "Lazio"] },
  { name: "意大利国家德比", competition: "SA", teams: ["Juventus", "Inter"] },
  // 德甲
  { name: "国家德比·拜仁多特", competition: "BL1", teams: ["Bayern", "Dortmund"] },
  { name: "鲁尔德比", competition: "BL1", teams: ["Dortmund", "Schalke"] },
  { name: "巴伐利亚德比", competition: "BL1", teams: ["Bayern", "Nürnberg"] },
  // 法甲
  { name: "经典德比", competition: "FL1", teams: ["Paris", "Marseille"] },
  { name: "罗讷河德比", competition: "FL1", teams: ["Lyon", "Saint-Étienne"] },
];

function matchesTeam(teamName: string, key: string): boolean {
  return teamName.toLowerCase().includes(key.toLowerCase());
}

export function findDerby(
  competition: CompetitionCode,
  homeTeam: string,
  awayTeam: string,
): Derby | null {
  for (const d of DERBIES) {
    if (d.competition !== competition) continue;
    const [a, b] = d.teams;
    const hit =
      (matchesTeam(homeTeam, a) && matchesTeam(awayTeam, b)) ||
      (matchesTeam(homeTeam, b) && matchesTeam(awayTeam, a));
    if (hit) return d;
  }
  return null;
}
