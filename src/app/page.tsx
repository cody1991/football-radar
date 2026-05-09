"use client";

import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import {
  AVAILABLE_CODES,
  COMPETITIONS,
  type CompetitionCode,
} from "@/lib/competitions";
import type { ScoredMatch } from "@/lib/score";
import { cn } from "@/lib/utils";

interface MatchesResp {
  from: string;
  to: string;
  total: number;
  worthWatching: number;
  matches: ScoredMatch[];
  cfg: { topN: number; topMode: "either" | "both"; includeDerbies: boolean };
  competitions: CompetitionCode[];
  lastRefreshAt: number | null;
  error?: string;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "未知";
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function Home() {
  const [date, setDate] = useState<string>(todayLocal());
  const [topN, setTopN] = useState(8);
  const [topMode, setTopMode] = useState<"either" | "both">("either");
  const [includeDerbies, setIncludeDerbies] = useState(true);
  const [comps, setComps] = useState<CompetitionCode[]>(AVAILABLE_CODES);

  const [data, setData] = useState<MatchesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams({
      from: date,
      to: shiftDate(date, 1),
      competitions: comps.join(","),
      topN: String(topN),
      topMode,
      includeDerbies: String(includeDerbies),
    });
    return sp.toString();
  }, [date, comps, topN, topMode, includeDerbies]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/matches?${queryString}`);
        const j: MatchesResp = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const top = data?.matches.filter((m) => m.worthWatching) ?? [];
  const others = data?.matches.filter((m) => !m.worthWatching) ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-accent to-emerald-300 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            Football Radar
          </h1>
          <p className="mt-1 text-sm text-muted">
            按球队排名 + 传统德比，把今天值得看的比赛推到你眼前
          </p>
        </div>
        <DatePicker date={date} setDate={setDate} />
      </header>

      <Filters
        comps={comps}
        setComps={setComps}
        topN={topN}
        setTopN={setTopN}
        topMode={topMode}
        setTopMode={setTopMode}
        includeDerbies={includeDerbies}
        setIncludeDerbies={setIncludeDerbies}
      />

      {loading && (
        <div className="mt-8 text-center text-sm text-muted">加载中…</div>
      )}

      {err && (
        <div className="mt-8 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          <div className="font-medium">加载失败</div>
          <div className="mt-1 break-all opacity-80">{err}</div>
          {err.includes("FOOTBALL_DATA_TOKEN") && (
            <div className="mt-2 text-xs text-red-200/80">
              在项目根目录的 <code className="rounded bg-black/30 px-1">.env.local</code>{" "}
              里设置 <code className="rounded bg-black/30 px-1">FOOTBALL_DATA_TOKEN</code>，然后重启 <code>npm run dev</code>。
            </div>
          )}
        </div>
      )}

      {data && !err && (
        <>
          <SectionHeader
            title={`值得看（${top.length}）`}
            sub={`共 ${data.total} 场`}
          />
          {top.length === 0 ? (
            <EmptyState text="今天没有命中筛选条件的比赛。换个日期或放宽 Top N 试试。" />
          ) : (
            <div className="space-y-2">
              {top.map((m) => (
                <MatchCard key={m.match.id} item={m} />
              ))}
            </div>
          )}

          {others.length > 0 && (
            <>
              <button
                onClick={() => setShowOthers((v) => !v)}
                className="mt-8 inline-flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted hover:bg-surface-2"
              >
                <span>其他比赛（{others.length}）</span>
                <span className="font-mono">{showOthers ? "−" : "+"}</span>
              </button>
              {showOthers && (
                <div className="mt-2 space-y-2">
                  {others.map((m) => (
                    <MatchCard key={m.match.id} item={m} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <footer className="mt-12 text-center text-xs text-muted/70">
        数据来源：football-data.org · 排名按当前赛季 TOTAL 表
        {data?.lastRefreshAt != null && (
          <span> · 数据更新于 {timeAgo(data.lastRefreshAt)}</span>
        )}
      </footer>
    </main>
  );
}

function DatePicker({
  date,
  setDate,
}: {
  date: string;
  setDate: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setDate(shiftDate(date, -1))}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        ← 昨天
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-mono tabular-nums"
      />
      <button
        onClick={() => setDate(todayLocal())}
        className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20"
      >
        今天
      </button>
      <button
        onClick={() => setDate(shiftDate(date, 1))}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        明天 →
      </button>
    </div>
  );
}

function Filters(props: {
  comps: CompetitionCode[];
  setComps: (v: CompetitionCode[]) => void;
  topN: number;
  setTopN: (v: number) => void;
  topMode: "either" | "both";
  setTopMode: (v: "either" | "both") => void;
  includeDerbies: boolean;
  setIncludeDerbies: (v: boolean) => void;
}) {
  const { comps, setComps, topN, setTopN, topMode, setTopMode, includeDerbies, setIncludeDerbies } = props;
  const toggleComp = (c: CompetitionCode) => {
    setComps(comps.includes(c) ? comps.filter((x) => x !== c) : [...comps, c]);
  };
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(COMPETITIONS) as CompetitionCode[]).map((c) => {
          const meta = COMPETITIONS[c];
          const on = comps.includes(c);
          const disabled = !meta.available;
          return (
            <button
              key={c}
              onClick={() => !disabled && toggleComp(c)}
              disabled={disabled}
              title={meta.note ?? meta.name}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                disabled && "cursor-not-allowed border-white/5 bg-white/[0.02] text-muted/50 line-through",
                !disabled && on && "border-accent/60 bg-accent/15 text-accent",
                !disabled && !on && "border-border bg-white/[0.02] text-muted hover:text-fg",
              )}
            >
              {meta.shortName}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-2">
          Top
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="rounded border border-border bg-surface px-2 py-1 text-fg"
          >
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <select
            value={topMode}
            onChange={(e) => setTopMode(e.target.value as "either" | "both")}
            className="rounded border border-border bg-surface px-2 py-1 text-fg"
          >
            <option value="either">任一方在 Top</option>
            <option value="both">双方都在 Top</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeDerbies}
            onChange={(e) => setIncludeDerbies(e.target.checked)}
            className="accent-accent"
          />
          含传统德比
        </label>
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-6 mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-10 text-center text-sm text-muted">
      {text}
    </div>
  );
}
