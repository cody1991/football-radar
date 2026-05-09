import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { COMPETITIONS, type CompetitionCode } from "./competitions";
import type { FdMatch } from "./football-data";
import type { MatchRow, StandingRow } from "./types";

const DB_PATH =
  process.env.FOOTBALL_RADAR_DB ??
  path.join(process.cwd(), "data", "football-radar.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const handle = new Database(DB_PATH);
  handle.pragma("journal_mode = WAL");
  handle.pragma("synchronous = NORMAL");
  handle.pragma("foreign_keys = ON");
  migrate(handle);
  _db = handle;
  return handle;
}

/**
 * 退出前调用：把 WAL 合并回主 db 文件并关闭句柄。
 * 这样 git commit data/ 时只需要追踪 .db 一个文件，不会带 .db-wal / .db-shm。
 */
export function closeDb() {
  if (!_db) return;
  try {
    _db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.warn("[db] checkpoint failed:", e);
  }
  _db.close();
  _db = null;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      utc_date TEXT NOT NULL,
      competition_code TEXT NOT NULL,
      competition_name TEXT NOT NULL,
      status TEXT NOT NULL,
      home_team_id INTEGER NOT NULL,
      home_team_name TEXT NOT NULL,
      home_team_crest TEXT,
      away_team_id INTEGER NOT NULL,
      away_team_name TEXT NOT NULL,
      away_team_crest TEXT,
      full_time_home INTEGER,
      full_time_away INTEGER,
      matchday INTEGER,
      stage TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_matches_utc_date ON matches(utc_date);
    CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_code);

    CREATE TABLE IF NOT EXISTS standings (
      competition_code TEXT NOT NULL,
      team_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      position INTEGER NOT NULL,
      points INTEGER NOT NULL,
      played_games INTEGER NOT NULL,
      goals_for INTEGER NOT NULL,
      goals_against INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (competition_code, team_id)
    );

    CREATE TABLE IF NOT EXISTS push_log (
      job TEXT NOT NULL,
      match_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      pushed_at INTEGER NOT NULL,
      PRIMARY KEY (job, match_id, date)
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // 历史遗留的 team_form 表清理：不再使用
  d.exec(`DROP TABLE IF EXISTS team_form;`);
}

// ---------- matches ----------

const upsertMatchStmt = (d: Database.Database) =>
  d.prepare(`
    INSERT INTO matches (
      id, utc_date, competition_code, competition_name, status,
      home_team_id, home_team_name, home_team_crest,
      away_team_id, away_team_name, away_team_crest,
      full_time_home, full_time_away, matchday, stage, updated_at
    ) VALUES (
      @id, @utcDate, @competitionCode, @competitionName, @status,
      @homeTeamId, @homeTeamName, @homeTeamCrest,
      @awayTeamId, @awayTeamName, @awayTeamCrest,
      @fullTimeHome, @fullTimeAway, @matchday, @stage, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      utc_date = excluded.utc_date,
      competition_code = excluded.competition_code,
      competition_name = excluded.competition_name,
      status = excluded.status,
      home_team_id = excluded.home_team_id,
      home_team_name = excluded.home_team_name,
      home_team_crest = excluded.home_team_crest,
      away_team_id = excluded.away_team_id,
      away_team_name = excluded.away_team_name,
      away_team_crest = excluded.away_team_crest,
      full_time_home = excluded.full_time_home,
      full_time_away = excluded.full_time_away,
      matchday = excluded.matchday,
      stage = excluded.stage,
      updated_at = excluded.updated_at
  `);

export function upsertMatches(rows: MatchRow[]) {
  const stmt = upsertMatchStmt(db());
  const tx = db().transaction((items: MatchRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
}

interface MatchRowDb {
  id: number;
  utc_date: string;
  competition_code: string;
  competition_name: string;
  status: string;
  home_team_id: number;
  home_team_name: string;
  home_team_crest: string | null;
  away_team_id: number;
  away_team_name: string;
  away_team_crest: string | null;
  full_time_home: number | null;
  full_time_away: number | null;
  matchday: number | null;
  stage: string | null;
  updated_at: number;
}

function toMatchRow(r: MatchRowDb): MatchRow {
  return {
    id: r.id,
    utcDate: r.utc_date,
    competitionCode: r.competition_code as CompetitionCode,
    competitionName: r.competition_name,
    status: r.status as MatchRow["status"],
    homeTeamId: r.home_team_id,
    homeTeamName: r.home_team_name,
    homeTeamCrest: r.home_team_crest,
    awayTeamId: r.away_team_id,
    awayTeamName: r.away_team_name,
    awayTeamCrest: r.away_team_crest,
    fullTimeHome: r.full_time_home,
    fullTimeAway: r.full_time_away,
    matchday: r.matchday,
    stage: r.stage,
    updatedAt: r.updated_at,
  };
}

/** 把存库形式的 MatchRow 适配为 FdMatch，方便复用 scoreMatch/format 等。 */
export function matchRowToFd(r: MatchRow): FdMatch {
  return {
    id: r.id,
    utcDate: r.utcDate,
    status: r.status,
    matchday: r.matchday ?? undefined,
    stage: r.stage ?? undefined,
    group: null,
    homeTeam: {
      id: r.homeTeamId,
      name: r.homeTeamName,
      crest: r.homeTeamCrest ?? undefined,
    },
    awayTeam: {
      id: r.awayTeamId,
      name: r.awayTeamName,
      crest: r.awayTeamCrest ?? undefined,
    },
    competition: {
      code: r.competitionCode,
      name:
        r.competitionName ||
        COMPETITIONS[r.competitionCode]?.name ||
        r.competitionCode,
    },
    score: {
      fullTime: { home: r.fullTimeHome, away: r.fullTimeAway },
      halfTime: { home: null, away: null },
    },
  };
}

export function getMatchesBetween(
  fromIso: string,
  toIso: string,
  competitionCodes?: CompetitionCode[],
): MatchRow[] {
  const placeholders = competitionCodes
    ? `AND competition_code IN (${competitionCodes.map(() => "?").join(",")})`
    : "";
  const params: (string | CompetitionCode)[] = [fromIso, toIso];
  if (competitionCodes) params.push(...competitionCodes);
  const rows = db()
    .prepare<unknown[], MatchRowDb>(
      `SELECT * FROM matches WHERE utc_date >= ? AND utc_date < ? ${placeholders} ORDER BY utc_date ASC`,
    )
    .all(...params);
  return rows.map(toMatchRow);
}

// ---------- standings ----------

const upsertStandingStmt = (d: Database.Database) =>
  d.prepare(`
    INSERT INTO standings (
      competition_code, team_id, team_name, position, points,
      played_games, goals_for, goals_against, updated_at
    ) VALUES (
      @competitionCode, @teamId, @teamName, @position, @points,
      @playedGames, @goalsFor, @goalsAgainst, @updatedAt
    )
    ON CONFLICT(competition_code, team_id) DO UPDATE SET
      team_name = excluded.team_name,
      position = excluded.position,
      points = excluded.points,
      played_games = excluded.played_games,
      goals_for = excluded.goals_for,
      goals_against = excluded.goals_against,
      updated_at = excluded.updated_at
  `);

export function upsertStandings(rows: StandingRow[]) {
  const stmt = upsertStandingStmt(db());
  const tx = db().transaction((items: StandingRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
}

interface StandingRowDb {
  competition_code: string;
  team_id: number;
  team_name: string;
  position: number;
  points: number;
  played_games: number;
  goals_for: number;
  goals_against: number;
  updated_at: number;
}

/**
 * 拍平：teamId -> position。同一球队在多个联赛参赛时只保留最先看到的，
 * 不再推荐使用，仅保留用于早期调用方兼容。请改用 makeRankLookup。
 */
export function getRankByTeamId(): Map<number, number> {
  const rows = db()
    .prepare<unknown[], StandingRowDb>(
      `SELECT team_id, position FROM standings`,
    )
    .all();
  const m = new Map<number, number>();
  for (const r of rows) if (!m.has(r.team_id)) m.set(r.team_id, r.position);
  return m;
}

/**
 * 二维：competitionCode -> (teamId -> position)。
 * 同一球队在德甲 / 欧冠的排名不同，应该按 match.competition.code 各自取。
 */
export function getRanksByCompetition(): Map<
  CompetitionCode,
  Map<number, number>
> {
  const rows = db()
    .prepare<unknown[], StandingRowDb>(
      `SELECT competition_code, team_id, position FROM standings`,
    )
    .all();
  const out = new Map<CompetitionCode, Map<number, number>>();
  for (const r of rows) {
    const code = r.competition_code as CompetitionCode;
    let m = out.get(code);
    if (!m) {
      m = new Map<number, number>();
      out.set(code, m);
    }
    m.set(r.team_id, r.position);
  }
  return out;
}

/**
 * 给 score 用的 lookup：先按 (competitionCode, teamId) 找本联赛的位置；
 * 找不到（比如欧冠球队中有非五大联赛 / standings 还没拉到）再退回任意联赛。
 */
export type RankLookup = (
  teamId: number,
  competitionCode: CompetitionCode,
) => number | null;

export function makeRankLookup(): RankLookup {
  const byComp = getRanksByCompetition();
  const flat = getRankByTeamId();
  return (teamId, code) => {
    const inComp = byComp.get(code)?.get(teamId);
    if (inComp != null) return inComp;
    return flat.get(teamId) ?? null;
  };
}

// ---------- push_log ----------

export function alreadyPushed(
  job: string,
  matchId: number,
  date: string,
): boolean {
  const row = db()
    .prepare(`SELECT 1 FROM push_log WHERE job = ? AND match_id = ? AND date = ?`)
    .get(job, matchId, date);
  return !!row;
}

export function markPushed(job: string, matchId: number, date: string) {
  db()
    .prepare(
      `INSERT OR IGNORE INTO push_log (job, match_id, date, pushed_at) VALUES (?, ?, ?, ?)`,
    )
    .run(job, matchId, date, Date.now());
}

// ---------- meta ----------

export function setMeta(key: string, value: string) {
  db()
    .prepare(
      `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}

export function getMeta(key: string): { value: string; updatedAt: number } | null {
  const row = db()
    .prepare<unknown[], { value: string; updated_at: number }>(
      `SELECT value, updated_at FROM meta WHERE key = ?`,
    )
    .get(key);
  return row ? { value: row.value, updatedAt: row.updated_at } : null;
}
