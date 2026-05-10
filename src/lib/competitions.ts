export type CompetitionCode =
  | "PL"
  | "PD"
  | "SA"
  | "BL1"
  | "FL1"
  | "ELC" // Championship 英冠
  | "DED" // Eredivisie 荷甲
  | "PPL" // Primeira Liga 葡超
  | "BSA" // Brasileirão 巴甲
  | "CL"
  | "EL"
  | "CLI" // Copa Libertadores 南美解放者杯
  | "WC"
  | "EC";

export interface CompetitionMeta {
  code: CompetitionCode;
  name: string;
  shortName: string;
  emoji: string;
  available: boolean;
  note?: string;
}

export const COMPETITIONS: Record<CompetitionCode, CompetitionMeta> = {
  PL: {
    code: "PL",
    name: "Premier League",
    shortName: "英超",
    emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    available: true,
  },
  PD: {
    code: "PD",
    name: "La Liga",
    shortName: "西甲",
    emoji: "🇪🇸",
    available: true,
  },
  SA: {
    code: "SA",
    name: "Serie A",
    shortName: "意甲",
    emoji: "🇮🇹",
    available: true,
  },
  BL1: {
    code: "BL1",
    name: "Bundesliga",
    shortName: "德甲",
    emoji: "🇩🇪",
    available: true,
  },
  FL1: {
    code: "FL1",
    name: "Ligue 1",
    shortName: "法甲",
    emoji: "🇫🇷",
    available: true,
  },
  ELC: {
    code: "ELC",
    name: "Championship",
    shortName: "英冠",
    emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    available: true,
  },
  DED: {
    code: "DED",
    name: "Eredivisie",
    shortName: "荷甲",
    emoji: "🇳🇱",
    available: true,
  },
  PPL: {
    code: "PPL",
    name: "Primeira Liga",
    shortName: "葡超",
    emoji: "🇵🇹",
    available: true,
  },
  BSA: {
    code: "BSA",
    name: "Campeonato Brasileiro",
    shortName: "巴甲",
    emoji: "🇧🇷",
    available: true,
  },
  CL: {
    code: "CL",
    name: "UEFA Champions League",
    shortName: "欧冠",
    emoji: "⭐",
    available: true,
  },
  EL: {
    code: "EL",
    name: "UEFA Europa League",
    shortName: "欧联",
    emoji: "🌟",
    available: false,
    note: "football-data.org 免费档不含欧联，升级 Tier One 后开放",
  },
  CLI: {
    code: "CLI",
    name: "Copa Libertadores",
    shortName: "解放者杯",
    emoji: "🌎",
    available: true,
    note: "南美最高俱乐部赛事，无联赛排名，always-推 + DISCORD_WEBHOOK_URL_CLI 频道。比赛时间多在欧洲深夜",
  },
  WC: {
    code: "WC",
    name: "FIFA World Cup",
    shortName: "世界杯",
    emoji: "🏆",
    available: true,
    note: "无联赛排名，scoreMatch 走 always-推 路线，DISCORD_WEBHOOK_URL_WC 频道",
  },
  EC: {
    code: "EC",
    name: "European Championship",
    shortName: "欧洲杯",
    emoji: "🇪🇺",
    available: true,
    note: "国家队赛事，无联赛排名，always-推 + DISCORD_WEBHOOK_URL_EC 频道。Euro 2028 才有数据",
  },
};

export const ALL_CODES = Object.keys(COMPETITIONS) as CompetitionCode[];
export const AVAILABLE_CODES = ALL_CODES.filter(
  (c) => COMPETITIONS[c].available,
);
