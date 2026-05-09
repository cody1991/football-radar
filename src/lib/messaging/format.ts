import { COMPETITIONS, type CompetitionCode } from "../competitions";
import type { ScoredMatch } from "../score";
import { displayTeamName } from "../team-names-zh";
import {
  COLOR,
  type DiscordEmbed,
  type DiscordEmbedField,
  type DiscordMessage,
} from "./discord";

const TZ = process.env.TZ || "Europe/Berlin";

/** 给当前 TZ 取一个简短偏移标签，例如 "UTC+2" */
function tzShort(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  const off = parts.find((p) => p.type === "timeZoneName")?.value || "";
  return off || TZ;
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

function fmtTimeShort(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

/** 队名 + 排名展示。未上榜不显示括号；前 4/前 8 都视为"靠前"，靠前与否由队名加粗体现。 */
function teamWithRank(name: string, pos: number | null): string {
  const zh = displayTeamName(name);
  if (pos == null) return zh;
  // 前 8 加粗，更突出强强对话；其他普通
  return pos <= 8 ? `**${zh} (#${pos})**` : `${zh} (#${pos})`;
}

function compTag(code: string): string {
  const m = COMPETITIONS[code as CompetitionCode];
  return m?.shortName ?? code;
}

function pickColor(item: ScoredMatch): number {
  if (item.derby) return COLOR.derby;
  if (item.match.competition.code === "CL") return COLOR.champions;
  return COLOR.accent;
}

/** 一行紧凑表示，用于早报/周报里的列表 */
function lineFor(item: ScoredMatch, opts: { withDate?: boolean } = {}): string {
  const { match, rank, derby } = item;
  const time = opts.withDate ? fmtTime(match.utcDate) : fmtTimeShort(match.utcDate);
  const home = teamWithRank(match.homeTeam.name, rank.home);
  const away = teamWithRank(match.awayTeam.name, rank.away);
  const tags = [`[${compTag(match.competition.code)}]`];
  if (derby) tags.push(`🔥${derby.name}`);
  return `\`${time}\` ${tags.join(" ")} ${home} vs ${away}`;
}

// ------------------ Morning digest ------------------

export function morningDigest(date: string, items: ScoredMatch[]): DiscordMessage {
  const worth = items.filter((i) => i.worthWatching);
  if (worth.length === 0) {
    return {
      embeds: [
        {
          title: `今日早报 · ${date}`,
          description: "今天没有命中筛选条件的比赛，可以好好休息一天。⚽💤",
          color: COLOR.muted,
        },
      ],
    };
  }
  const lines = worth.map((i) => lineFor(i)).join("\n");
  const embed: DiscordEmbed = {
    title: `今日早报 · ${date}`,
    description: lines.slice(0, 4000),
    color: COLOR.accent,
    footer: {
      text: `共 ${worth.length} 场值得看 · 时间 ${tzShort()} (${TZ}) · 数据来源 football-data.org`,
    },
  };
  return { embeds: [embed] };
}

// ------------------ Kickoff alert (单场) ------------------

export function kickoffAlert(item: ScoredMatch, minutesUntil: number): DiscordMessage {
  const { match, rank, derby, reasons } = item;
  // embed.title 不渲染 markdown，所以这里给纯文本形式（中文 + (#N)）
  const homeTitle = `${displayTeamName(match.homeTeam.name)}${
    rank.home != null ? ` (#${rank.home})` : ""
  }`;
  const awayTitle = `${displayTeamName(match.awayTeam.name)}${
    rank.away != null ? ` (#${rank.away})` : ""
  }`;
  const tagBits: string[] = [];
  if (derby) tagBits.push(`🔥 **${derby.name}**`);
  tagBits.push(...reasons.map((r) => `· ${r}`));

  return {
    content: `⏰ **${minutesUntil} 分钟后开赛** · ${compTag(match.competition.code)}`,
    embeds: [
      {
        title: `${homeTitle}  vs  ${awayTitle}`,
        description: tagBits.join("  "),
        color: pickColor(item),
        thumbnail: match.homeTeam.crest ? { url: match.homeTeam.crest } : undefined,
        fields: [
          {
            name: "开赛时间",
            value: fmtTime(match.utcDate),
            inline: true,
          },
          {
            name: "含金量",
            value: `${Math.round(item.score)}`,
            inline: true,
          },
        ],
      },
    ],
  };
}

// ------------------ Weekly preview ------------------

interface WeeklyGroup {
  dateLabel: string;
  items: ScoredMatch[];
}

export function weeklyPreview(weekLabel: string, groups: WeeklyGroup[]): DiscordMessage {
  if (groups.every((g) => g.items.length === 0)) {
    return {
      embeds: [
        {
          title: `本周末重头戏 · ${weekLabel}`,
          description: "本周末暂无命中筛选条件的比赛。",
          color: COLOR.muted,
        },
      ],
    };
  }
  const fields: DiscordEmbedField[] = groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      name: g.dateLabel,
      value: g.items
        .slice(0, 8) // 单天最多 8 条避免超长
        .map((i) => lineFor(i))
        .join("\n")
        .slice(0, 1024),
    }));
  return {
    embeds: [
      {
        title: `本周末重头戏 · ${weekLabel}`,
        color: COLOR.accent,
        fields,
        footer: { text: `周末预告 · 时间 ${tzShort()} (${TZ})` },
      },
    ],
  };
}
