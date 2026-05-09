export type CompetitionCode =
  | "PL"
  | "PD"
  | "SA"
  | "BL1"
  | "FL1"
  | "CL"
  | "EL";

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
};

export const ALL_CODES = Object.keys(COMPETITIONS) as CompetitionCode[];
export const AVAILABLE_CODES = ALL_CODES.filter(
  (c) => COMPETITIONS[c].available,
);
