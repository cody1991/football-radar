import { COMPETITIONS, type CompetitionCode } from "../competitions";
import { arrangeMatch, type ScoredMatch } from "../score";
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

/** 一行紧凑表示，用于早报/周报里的列表。两队按排名排序，靠前的在左。 */
function lineFor(item: ScoredMatch, opts: { withDate?: boolean } = {}): string {
  const { match, derby } = item;
  const a = arrangeMatch(item);
  const time = opts.withDate ? fmtTime(match.utcDate) : fmtTimeShort(match.utcDate);
  const left = teamWithRank(a.leftTeamName, a.leftRank);
  const right = teamWithRank(a.rightTeamName, a.rightRank);
  const tags = [`[${compTag(match.competition.code)}]`];
  if (derby) tags.push(`🔥${derby.name}`);
  // 用 ` v ` 而不是 ` vs ` 来弱化主客（已被打乱），左侧不一定是主场
  return `\`${time}\` ${tags.join(" ")} ${left} v ${right}`;
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

export interface TonightExtra {
  remainingCount: number;
  nextKickoffTime: string | null;
}

export interface KickoffAlertOpts {
  /** teamId -> form 字符串（W/D/L 序列，最近场在最前），可选 */
  formByTeam?: Map<number, string | null>;
  /** 今晚剩余场次提示，可选 */
  tonight?: TonightExtra;
}

/** 把 W/D/L 序列染成 emoji，方便一眼读懂状态。最近场在最前。 */
function colorForm(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .split("")
    .map((c) => {
      if (c === "W") return "🟢";
      if (c === "D") return "⚪";
      if (c === "L") return "🔴";
      return "❔";
    })
    .join("");
}

export function kickoffAlert(
  item: ScoredMatch,
  minutesUntil: number,
  opts: KickoffAlertOpts = {},
): DiscordMessage {
  const { match, derby, reasons } = item;
  const a = arrangeMatch(item);

  const leftLabel = `${displayTeamName(a.leftTeamName)}${
    a.leftRank != null ? ` (#${a.leftRank})` : ""
  }${a.leftIsHome ? " · 主" : " · 客"}`;
  const rightLabel = `${displayTeamName(a.rightTeamName)}${
    a.rightRank != null ? ` (#${a.rightRank})` : ""
  }${a.leftIsHome ? " · 客" : " · 主"}`;

  const leftForm = opts.formByTeam?.get(a.leftTeamId) ?? null;
  const rightForm = opts.formByTeam?.get(a.rightTeamId) ?? null;
  const hasAnyForm = leftForm != null || rightForm != null;

  const tagBits: string[] = [];
  if (derby) tagBits.push(`🔥 **${derby.name}**`);
  tagBits.push(...reasons.map((r) => `· ${r}`));

  const fields: DiscordEmbedField[] = [
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
  ];
  if (hasAnyForm) {
    // 把双方近 5 场放一行 inline=false，宽点好看
    fields.push({
      name: "近 5 场（左→最近）",
      value: `**${displayTeamName(a.leftTeamName)}** ${colorForm(leftForm)}\n**${displayTeamName(
        a.rightTeamName,
      )}** ${colorForm(rightForm)}`,
      inline: false,
    });
  }
  if (opts.tonight && opts.tonight.remainingCount > 0) {
    fields.push({
      name: "今晚后续",
      value:
        opts.tonight.nextKickoffTime != null
          ? `还有 ${opts.tonight.remainingCount} 场命中比赛，下一场 ${opts.tonight.nextKickoffTime}`
          : `还有 ${opts.tonight.remainingCount} 场命中比赛`,
      inline: false,
    });
  }

  return {
    content: `⏰ **${minutesUntil} 分钟后开赛** · ${compTag(match.competition.code)}`,
    embeds: [
      {
        // author = 左队（含 logo）；title = "v 右队 ..."；thumbnail = 右队 logo
        author: a.leftTeamCrest
          ? { name: leftLabel, icon_url: a.leftTeamCrest }
          : { name: leftLabel },
        title: `v  ${rightLabel}`,
        description: tagBits.join("  "),
        color: pickColor(item),
        thumbnail: a.rightTeamCrest ? { url: a.rightTeamCrest } : undefined,
        fields,
        footer: { text: `时间 ${tzShort()} (${TZ})` },
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
