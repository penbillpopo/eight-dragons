/** 投信買超一日 */
export type TrustBuyRow = {
  /** 日期 */
  date: string;
  /** 排名 */
  rank: number;
  /** 股票代號 */
  code: string;
  /** 股票名稱 */
  name: string;
  /** 收盤價 */
  close: number;
  /** 漲跌金額 */
  change: string;
  /** 漲跌幅（百分比字串，例如 "+2.5%"） */
  changePct: string;
  /** 投信買進張數 */
  buy: number;
  /** 投信賣出張數 */
  sell: number;
  /** 投信買賣超張數 */
  net: number;
};

/** 券商進出 */
export type BrokerFlowRow = {
  /** 日期 */
  date: string;
  /** 券商名稱 */
  broker: string;
  /** 買進張數或金額（依頁面欄位） */
  buyAmt: number;
  /** 賣出張數或金額（依頁面欄位） */
  sellAmt: number;
  /** 買賣超（正 = 買超，負 = 賣超） */
  diff: number;
};

export type Broker = {
  idx: number;
  label: string;
  buyAmt: number;
  sellAmt: number;
  diff: number;
};
export type Item = {
  code: string;
  name: string;
  brokers: Broker[];
  sumBuyAmt: number;
  sumSellAmt: number;
  sumDiff: number;
};
export type BrokersPayload = { count: number; data: Item[] };
