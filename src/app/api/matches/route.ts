import { NextResponse } from "next/server";
import {
  AVAILABLE_CODES,
  COMPETITIONS,
  type CompetitionCode,
} from "@/lib/competitions";
import {
  getMatchesBetween,
  getMeta,
  getRankByTeamId,
  matchRowToFd,
} from "@/lib/db";
import { DEFAULT_CONFIG, scoreMatch, type ScoringConfig } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = process.env.TZ || "Europe/Berlin";

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(new Date());
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromDate = url.searchParams.get("from") ?? todayLocal();
  const toDate = url.searchParams.get("to") ?? nextDay(fromDate);

  const codesParam = url.searchParams.get("competitions");
  const codes = (
    codesParam ? (codesParam.split(",") as CompetitionCode[]) : AVAILABLE_CODES
  ).filter((c) => COMPETITIONS[c]?.available);

  const cfg: ScoringConfig = {
    topN: Number(url.searchParams.get("topN") ?? DEFAULT_CONFIG.topN),
    topMode:
      (url.searchParams.get("topMode") as ScoringConfig["topMode"]) ??
      DEFAULT_CONFIG.topMode,
    includeDerbies:
      (url.searchParams.get("includeDerbies") ?? "true") !== "false",
  };

  // 把本地日期窗口转成 UTC ISO 范围（与存库格式一致）
  const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
  const toIso = new Date(`${toDate}T00:00:00`).toISOString();

  try {
    const rows = getMatchesBetween(fromIso, toIso, codes);
    const rankByTeam = getRankByTeamId();
    const scored = rows
      .map((r) => scoreMatch(matchRowToFd(r), rankByTeam, cfg))
      .sort((a, b) => b.score - a.score);

    const lastRefresh = getMeta("last_refresh_at");

    return NextResponse.json({
      from: fromDate,
      to: toDate,
      cfg,
      competitions: codes,
      total: scored.length,
      worthWatching: scored.filter((s) => s.worthWatching).length,
      matches: scored,
      lastRefreshAt: lastRefresh ? Number(lastRefresh.value) : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
