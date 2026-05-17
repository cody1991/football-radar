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

export interface KickoffAlertOpts {
  /** 这条是当晚第几场 / 共几场，可选 */
  sequence?: { index: number; total: number };
}

export function kickoffAlert(
  item: ScoredMatch,
  minutesUntil: number,
  opts: KickoffAlertOpts = {},
): DiscordMessage {
  const { match, derby, reasons } = item;
  const a = arrangeMatch(item);

  // kickoff alert 的视觉重心放在 thumbnail（右上大图），所以强队（leftRank 更小）
  // 渲染到 thumbnail 一侧；author（左上小圆）留给弱队
  // a.leftXxx 在数据语义上是"排名靠前"，这里反过来塞进 author：
  const featuredName = a.leftTeamName;
  const featuredRank = a.leftRank;
  const featuredCrest = a.leftTeamCrest;
  const featuredIsHome = a.leftIsHome;
  const opponentName = a.rightTeamName;
  const opponentRank = a.rightRank;
  const opponentCrest = a.rightTeamCrest;
  const opponentIsHome = !a.leftIsHome;

  // author 行（小圆 icon + 文字）= 弱队
  const authorLabel = `${displayTeamName(opponentName)}${
    opponentRank != null ? ` (#${opponentRank})` : ""
  }${opponentIsHome ? " · 主" : " · 客"}`;
  // title 行 = 强队（含主/客）
  const titleLabel = `v  ${displayTeamName(featuredName)}${
    featuredRank != null ? ` (#${featuredRank})` : ""
  }${featuredIsHome ? " · 主" : " · 客"}`;

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

  const seqBit = opts.sequence
    ? ` · 第 ${opts.sequence.index}/${opts.sequence.total} 场`
    : "";

  return {
    content: `⏰ **${fmtTimeShort(match.utcDate)} 开赛** · ${minutesUntil} 分钟后 · ${compTag(match.competition.code)}${seqBit}`,
    embeds: [
      {
        // author = 弱队（小圆 icon）；title 主体 = 强队；thumbnail = 强队 logo（大图，视觉重心）
        author: opponentCrest
          ? { name: authorLabel, icon_url: opponentCrest }
          : { name: authorLabel },
        title: titleLabel,
        description: tagBits.join("  "),
        color: pickColor(item),
        thumbnail: featuredCrest ? { url: featuredCrest } : undefined,
        fields,
        footer: { text: `时间 ${tzShort()} (${TZ})` },
      },
    ],
  };
}

// ------------------ Kickoff imminent ping (开赛前 5min 简短提醒) ------------------

/**
 * 紧凑两行 ping：用于 kickoff alert 之外的"临开赛"提醒。
 * 跟完整 alert 不同：不带 embed，只用 content + @here，不再贴 logo / fields，
 * 但保留排名 / 含金量 / 德比这种「值得看」的判断依据，避免变成无信息的纯吆喝。
 */
export function imminentPing(
  item: ScoredMatch,
  minutesUntil: number,
): DiscordMessage {
  const { match, derby } = item;
  const a = arrangeMatch(item);
  const left = teamWithRank(a.leftTeamName, a.leftRank);
  const right = teamWithRank(a.rightTeamName, a.rightRank);

  // 第一行：警报 + 联赛 + 开赛时间 + 含金量（一眼能扫到判断要不要点开）
  const headBits: string[] = [
    `@here 🚨 **${minutesUntil} 分钟后开赛**`,
    compTag(match.competition.code),
    fmtTimeShort(match.utcDate),
    `含金量 ${Math.round(item.score)}`,
  ];
  // 第二行：对阵 + 入选原因（双方 Top 8 / 豪门坐镇 / 德比 等）
  const tagBits: string[] = [`${left} v ${right}`];
  if (derby) tagBits.push(`🔥 ${derby.name}`);
  tagBits.push(...item.reasons.filter((r) => !derby || !r.includes(derby.name)));

  return {
    content: `${headBits.join(" · ")}\n${tagBits.join(" · ")}`,
    // Discord 默认会让 @here 解析成提及；显式声明一下确保生效
    allowed_mentions: { parse: ["everyone"] },
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
