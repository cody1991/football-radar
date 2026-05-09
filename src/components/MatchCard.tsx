import Image from "next/image";
import { COMPETITIONS, type CompetitionCode } from "@/lib/competitions";
import type { ScoredMatch } from "@/lib/score";
import { displayTeamName } from "@/lib/team-names-zh";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

function rankTextColor(pos: number | null): string {
  if (pos == null) return "text-muted/60";
  if (pos <= 4) return "text-gold";
  if (pos <= 8) return "text-accent";
  return "text-muted";
}

function RankSuffix({
  pos,
  side = "left",
}: {
  pos: number | null;
  side?: "left" | "right";
}) {
  if (pos == null) return null;
  return (
    <span
      className={cn(
        "font-mono tabular-nums text-xs",
        side === "left" ? "ml-1" : "mr-1",
        rankTextColor(pos),
      )}
      title={`联赛排名 第 ${pos} 位`}
    >
      #{pos}
    </span>
  );
}

function TeamLogo({ src, alt }: { src?: string; alt: string }) {
  if (!src) {
    return (
      <div className="h-7 w-7 rounded-full bg-white/5 ring-1 ring-white/10" />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={28}
      height={28}
      className="h-7 w-7 rounded-full object-contain bg-white/5"
      unoptimized
    />
  );
}

export function MatchCard({ item }: { item: ScoredMatch }) {
  const { match, rank, derby, score, reasons, worthWatching } = item;
  const comp = COMPETITIONS[match.competition.code as CompetitionCode];
  const finished = match.status === "FINISHED";
  const live =
    match.status === "IN_PLAY" || match.status === "PAUSED";

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border bg-surface px-4 py-3 transition",
        worthWatching
          ? "hover:border-accent/60 hover:bg-surface-2"
          : "opacity-70 hover:opacity-100",
      )}
    >
      {/* 顶部: 联赛 + 时间 + 状态 + 含金量 */}
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-fg/80">
            {comp?.shortName ?? match.competition.name}
          </span>
          {derby && (
            <span className="rounded bg-warn/15 px-1.5 py-0.5 font-medium text-warn ring-1 ring-warn/30">
              {derby.name}
            </span>
          )}
          {live && (
            <span className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-red-400 ring-1 ring-red-500/40">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              进行中
            </span>
          )}
          {finished && (
            <span className="rounded bg-white/5 px-1.5 py-0.5">已结束</span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono tabular-nums">
          <span>{formatTime(match.utcDate)}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5",
              worthWatching
                ? "bg-accent/15 text-accent"
                : "bg-white/5 text-muted",
            )}
            title="含金量"
          >
            {Math.round(score)}
          </span>
        </div>
      </div>

      {/* 主队 / 客队 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-2 justify-self-start min-w-0">
          <TeamLogo src={match.homeTeam.crest} alt={match.homeTeam.name} />
          <div className="flex items-baseline gap-1 truncate">
            <span className="truncate font-medium" title={match.homeTeam.name}>
              {displayTeamName(match.homeTeam.name)}
            </span>
            <RankSuffix pos={rank.home} />
          </div>
        </div>
        <div className="px-2 text-center font-mono text-sm text-muted">
          {finished || live
            ? `${match.score.fullTime.home ?? 0} : ${
                match.score.fullTime.away ?? 0
              }`
            : "vs"}
        </div>
        <div className="flex items-center gap-2 justify-self-end min-w-0">
          <div className="flex items-baseline gap-1 truncate justify-end">
            <RankSuffix pos={rank.away} side="right" />
            <span className="truncate font-medium" title={match.awayTeam.name}>
              {displayTeamName(match.awayTeam.name)}
            </span>
          </div>
          <TeamLogo src={match.awayTeam.crest} alt={match.awayTeam.name} />
        </div>
      </div>

      {/* 入选理由 */}
      {reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
          {reasons.map((r) => (
            <span
              key={r}
              className="rounded bg-white/[0.03] px-1.5 py-0.5 ring-1 ring-white/5"
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
