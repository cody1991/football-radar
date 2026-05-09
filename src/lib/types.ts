import type { CompetitionCode } from "./competitions";

/** 已落库后的比赛行（语义比 football-data 原始结构更清爽） */
export interface MatchRow {
  id: number;
  utcDate: string;
  competitionCode: CompetitionCode;
  competitionName: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "POSTPONED"
    | "SUSPENDED"
    | "CANCELLED";
  homeTeamId: number;
  homeTeamName: string;
  homeTeamCrest: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamCrest: string | null;
  fullTimeHome: number | null;
  fullTimeAway: number | null;
  matchday: number | null;
  stage: string | null;
  updatedAt: number;
}

export interface StandingRow {
  competitionCode: CompetitionCode;
  teamId: number;
  teamName: string;
  position: number;
  points: number;
  playedGames: number;
  goalsFor: number;
  goalsAgainst: number;
  updatedAt: number;
}
