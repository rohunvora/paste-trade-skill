export type Hip3AssetClass =
  | "crypto"
  | "equity"
  | "index"
  | "commodity"
  | "fx"
  | "private_valuation"
  | "other";

export interface Hip3ManualProfile {
  asset_class?: Hip3AssetClass;
  theme_tags?: string[];
  instrument_description?: string;
  pricing_note?: string;
  reference_symbols?: string[];
  search_aliases?: string[];
  routing_note?: string;
}

export const HIP3_MANUAL_PROFILES: Record<string, Hip3ManualProfile> = {
  ANTHROPIC: {
    reference_symbols: ["ANTHROPIC"],
    search_aliases: ["anthropic", "claude"],
    routing_note: "Private-valuation perp; price is the implied company valuation in billions.",
  },
  BIOTECH: {
    reference_symbols: ["XBI", "IBB"],
    search_aliases: ["biotech", "biotechnology", "drug developers"],
    routing_note: "Sector basket; use for biotech-theme theses rather than a single drug name.",
  },
  BRENTOIL: {
    reference_symbols: ["BNO", "BRENT"],
    search_aliases: ["brent crude", "brent oil"],
  },
  CL: {
    reference_symbols: ["USO", "WTI", "CL"],
    search_aliases: ["wti", "west texas intermediate", "crude oil"],
  },
  COPPER: {
    reference_symbols: ["CPER", "COPPER", "HG"],
    search_aliases: ["copper", "industrial metals"],
  },
  DEFENSE: {
    reference_symbols: ["SHLD", "ITA", "PPA"],
    search_aliases: ["defense", "aerospace defense", "military"],
    routing_note: "Sector basket; use for defense-industry theses rather than a single contractor.",
  },
  ENERGY: {
    reference_symbols: ["XLE", "VDE"],
    search_aliases: ["energy sector", "oil and gas equities"],
    routing_note: "Sector basket; use for broad energy theses rather than a single producer.",
  },
  EUR: {
    reference_symbols: ["FXE", "EURUSD", "EUR"],
    search_aliases: ["euro", "eur usd"],
  },
  EWJ: {
    asset_class: "equity",
    reference_symbols: ["EWJ"],
    search_aliases: ["msci japan", "japan equities"],
    routing_note: "ETF-style Japan equity exposure, not a native index future.",
  },
  EWY: {
    asset_class: "equity",
    reference_symbols: ["EWY"],
    search_aliases: ["msci south korea", "korea equities"],
    routing_note: "ETF-style South Korea equity exposure, not a native index future.",
  },
  GLDMINE: {
    reference_symbols: ["GDX", "GLDMINE"],
    search_aliases: ["gold miners", "gold mining equities"],
    routing_note: "Gold-miner equity basket, broader than junior-miner specific exposure.",
  },
  GOLD: {
    reference_symbols: ["GLD", "IAU", "GC", "GOLD"],
    search_aliases: ["gold", "bullion", "spot gold"],
  },
  INFOTECH: {
    reference_symbols: ["XLK", "VGT"],
    search_aliases: ["technology sector", "tech sector"],
    routing_note: "Sector basket; broader than semis or software-only exposure.",
  },
  JPY: {
    reference_symbols: ["FXY", "USDJPY", "JPY"],
    search_aliases: ["yen", "usd jpy"],
  },
  MAG7: {
    reference_symbols: ["MAGS", "MAG7"],
    search_aliases: ["magnificent seven", "mega cap tech"],
    routing_note: "Thematic mega-cap tech basket, not a single-name trade.",
  },
  NATGAS: {
    reference_symbols: ["UNG", "NATGAS"],
    search_aliases: ["natural gas", "henry hub"],
    routing_note: "Primary natural gas perp by volume.",
  },
  NUCLEAR: {
    reference_symbols: ["NLR", "NUCLEAR"],
    search_aliases: ["nuclear", "nuclear energy"],
    routing_note: "Sector basket across uranium, reactors, and nuclear utilities.",
  },
  OIL: {
    asset_class: "commodity",
    instrument_description: "OIL tracks WTI crude oil exposure.",
    reference_symbols: ["OIL"],
    search_aliases: ["crude oil"],
    routing_note: "See also CL for the primary WTI perp exposure.",
  },
  OPENAI: {
    reference_symbols: ["OPENAI"],
    search_aliases: ["openai", "chatgpt"],
    routing_note: "Private-valuation perp; price is the implied company valuation in billions.",
  },
  PALLADIUM: {
    reference_symbols: ["PALL", "PALLADIUM"],
    search_aliases: ["palladium"],
  },
  PLATINUM: {
    reference_symbols: ["PPLT", "PLATINUM"],
    search_aliases: ["platinum"],
  },
  ROBOT: {
    reference_symbols: ["BOTZ", "IRBO", "ROBOT"],
    search_aliases: ["robotics", "automation"],
    routing_note: "Robotics/automation basket, not a single industrial name.",
  },
  SEMI: {
    reference_symbols: ["SEMI"],
    search_aliases: ["semiconductors", "chip sector"],
    routing_note: "Semiconductor equity basket. See also SEMIS for the primary semi exposure.",
  },
  SEMIS: {
    reference_symbols: ["SMH", "SOXX", "SEMIS"],
    search_aliases: ["semiconductors", "chip sector"],
    routing_note: "Primary semiconductor basket, not a single chipmaker.",
  },
  SILVER: {
    reference_symbols: ["SLV", "SIVR", "SILVER"],
    search_aliases: ["silver", "spot silver"],
  },
  SMALL2000: {
    reference_symbols: ["IWM", "VTWO", "RTY", "SMALL2000"],
    search_aliases: ["russell 2000", "small caps"],
  },
  SPACEX: {
    reference_symbols: ["SPACEX"],
    search_aliases: ["spacex", "starlink"],
    routing_note: "Private-valuation perp; price is the implied company valuation in billions.",
  },
  URNM: {
    asset_class: "equity",
    reference_symbols: ["URNM", "URA"],
    search_aliases: ["uranium miners", "uranium etf"],
    routing_note: "ETF-style uranium-miner exposure.",
  },
  US500: {
    reference_symbols: ["US500"],
    search_aliases: ["us 500"],
    routing_note: "S&P 500 exposure. See also SP500 (xyz:SP500) for the official index perp.",
  },
  SP500: {
    reference_symbols: ["SPY", "VOO", "IVV", "SPLG", "SP500", "USA500"],
    search_aliases: ["s&p 500", "sp500", "us 500"],
    routing_note: "Official S&P 500 perpetual on Hyperliquid (xyz:SP500). Replaces USA500.",
  },
  USBOND: {
    reference_symbols: ["TLT", "USBOND"],
    search_aliases: ["long treasuries", "20 year treasury", "treasury bonds"],
    routing_note: "Duration-sensitive Treasury exposure; closest to long-bond ETF risk.",
  },
  USENERGY: {
    reference_symbols: ["USENERGY"],
    search_aliases: ["us energy"],
    routing_note: "U.S. energy sector. See also ENERGY for the primary energy basket.",
  },
  USOIL: {
    reference_symbols: ["USOIL"],
    search_aliases: ["front month oil"],
    routing_note: "WTI-style oil via futures/ETF behavior. See also CL for the primary WTI perp.",
  },
  USTECH: {
    reference_symbols: ["USTECH"],
    search_aliases: ["us tech"],
    routing_note: "Nasdaq-style tech index. See also XYZ100 for the primary Nasdaq-100 exposure.",
  },
  XYZ100: {
    reference_symbols: ["QQQ", "QQQM", "NDX", "ONEQ", "XYZ100"],
    search_aliases: ["nasdaq 100", "u.s. tech index", "us growth index"],
    routing_note: "Most liquid Nasdaq-style index exposure on current HIP-3 venues.",
  },
};

export const HIP3_EQUIVALENT_ALIASES: Record<string, string> = {
  BNO: "BRENTOIL",
  BOTZ: "ROBOT",
  CPER: "COPPER",
  FXE: "EUR",
  FXY: "JPY",
  GDX: "GLDMINE",

  GLD: "GOLD",
  IAU: "GOLD",
  IBB: "BIOTECH",
  IRBO: "ROBOT",
  ITA: "DEFENSE",
  IVV: "USA500",
  IWM: "SMALL2000",
  MAGS: "MAG7",
  NDX: "XYZ100",
  NLR: "NUCLEAR",
  ONEQ: "XYZ100",
  PALL: "PALLADIUM",
  PPA: "DEFENSE",
  PPLT: "PLATINUM",
  QQQ: "XYZ100",
  QQQM: "XYZ100",
  RTY: "SMALL2000",
  SHLD: "DEFENSE",

  SIVR: "SILVER",
  SLV: "SILVER",
  SMH: "SEMIS",
  SOXX: "SEMIS",
  SPLG: "SP500",
  SPY: "SP500",
  TLT: "USBOND",
  UNG: "NATGAS",
  URA: "URNM",

  USO: "CL",
  VDE: "ENERGY",
  VGT: "INFOTECH",
  VOO: "USA500",
  VTWO: "SMALL2000",
  XBI: "BIOTECH",
  XLE: "ENERGY",
  XLK: "INFOTECH",
};
