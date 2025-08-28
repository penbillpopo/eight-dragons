// src/crawler/crawler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import retry from 'async-retry';
import { BrokerFlowRow, BrokersPayload, TrustBuyRow } from './types';

type NormalizedBrokerRow = {
  code: string;
  name: string;
  buyAmt: number;
  sellAmt: number;
  diff: number;
};

export interface OverlapItem {
  code: string;
  name: string;
  brokers: {
    idx: number; // 原本是 1 | 2 | 3，改成 number
    label: string;
    buyAmt: number;
    sellAmt: number;
    diff: number;
  }[];
  sumBuyAmt: number;
  sumSellAmt: number;
  sumDiff: number;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private readonly http: HttpService) {}

  /** 下載 HTML（重試 + 轉碼），回傳 UTF-8 文字 */
  private async fetchHtml(url: string): Promise<string> {
    return await retry<string>(
      async () => {
        const res: AxiosResponse<Buffer | ArrayBuffer | string> =
          await firstValueFrom(
            this.http.get<Buffer | ArrayBuffer | string>(url, {
              responseType: 'arraybuffer' as const, // Node 環境多半回 Buffer
              responseEncoding: 'binary', // 保留原始位元資料
              transformResponse: [], // 關掉 axios 預設字串化
              headers: {
                Referer: 'https://fubon-ebrokerdj.fbs.com.tw/',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
              },
              timeout: 15000,
            }),
          );

        const data = res.data;

        // 1) Node 常見：Buffer
        if (Buffer.isBuffer(data)) {
          let html = iconv.decode(data, 'utf8');
          if (html.includes('�')) html = iconv.decode(data, 'cp950');
          return html;
        }

        // 2) ArrayBuffer（較少見）
        if (data instanceof ArrayBuffer) {
          const buf = Buffer.from(new Uint8Array(data));
          let html = iconv.decode(buf, 'utf8');
          if (html.includes('�')) html = iconv.decode(buf, 'cp950');
          return html;
        }

        // 3) 已是字串
        if (typeof data === 'string') {
          return data;
        }

        throw new Error(
          `Unexpected response data type: ${Object.prototype.toString.call(data)}`,
        );
      },
      { retries: 2 },
    );
  }

  /** 安全地把字串數字轉 number；失敗回 0 */
  private toNumber(text: string): number {
    const n = Number.parseFloat(text.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  /** 解析 "<!-- GenLink2stk('AS2330','台積電') -->" 或 "2330 台積電" / "00919 群益..." */
  private parseCodeName(raw: string): { code: string; name: string } | null {
    const s = raw.replace(/\s+/g, ' ');
    const m = s.match(/GenLink2stk\('AS(\d+)','([^']+)'\)/);
    if (m) return { code: m[1], name: m[2] };

    const t = s.replace(/<!--|-->/g, '').trim();
    const m2 = t.match(/(\d{4,5})\s+(.+?)$/); // 支援 4~5 位數代碼（ETF 也能抓）
    if (m2) return { code: m2[1], name: m2[2] };

    return null;
  }

  /** 將 BrokerFlowRow 標準化成可交集的列（解析出 code/name），只保留解析成功者 */
  private normalizeRows(rows: BrokerFlowRow[]): NormalizedBrokerRow[] {
    const out: NormalizedBrokerRow[] = [];
    for (const r of rows) {
      const parsed = this.parseCodeName(r.broker);
      if (!parsed) continue;
      out.push({
        code: parsed.code,
        name: parsed.name,
        buyAmt: r.buyAmt,
        sellAmt: r.sellAmt,
        diff: r.diff,
      });
    }
    return out;
  }

  /** 合併同清單內重覆代碼（加總） */
  private mergeByCode(
    rows: NormalizedBrokerRow[],
  ): Map<string, NormalizedBrokerRow> {
    const m = new Map<string, NormalizedBrokerRow>();
    for (const r of rows) {
      const prev = m.get(r.code);
      if (!prev) {
        m.set(r.code, { ...r });
      } else {
        m.set(r.code, {
          code: r.code,
          name: r.name || prev.name,
          buyAmt: prev.buyAmt + r.buyAmt,
          sellAmt: prev.sellAmt + r.sellAmt,
          diff: prev.diff + r.diff,
        });
      }
    }
    return m;
  }

  /** 投信買超一日(上市) */
  async fetchTrustInvestListed(day: string): Promise<TrustBuyRow[]> {
    const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zg/zg_DD_0_${day}.djhtm`;
    return this._fetchTrustInvestDaily(url);
  }

  /** 投信買超一日(上櫃) */
  async fetchTrustInvestOTC(day: string): Promise<TrustBuyRow[]> {
    const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zg/zg_DD_1_${day}.djhtm`;
    return this._fetchTrustInvestDaily(url);
  }

  /** 券商進出（參數化） */
  async fetchBrokerFlow(params: {
    a: string | number;
    b: string | number;
    c?: string;
    d?: string | number;
    e?: string;
    f?: string;
  }): Promise<BrokerFlowRow[]> {
    const search = new URLSearchParams();
    search.set('a', String(params.a));
    search.set('b', String(params.b));
    if (params.c) search.set('c', params.c);
    if (params.d != null) search.set('d', String(params.d));
    if (params.e) search.set('e', params.e);
    if (params.f) search.set('f', params.f);

    return this._fubonCrawler(
      search.get('a') ?? '',
      search.get('b') ?? '',
      search.get('c') ?? '',
      search.get('d') ?? '',
    );
  }

  /** 將投信榜轉成券商格式（用張數*收盤價估金額，單位：元；不用 *1000） */
  public trustToBroker(list: TrustBuyRow[]): BrokerFlowRow[] {
    const safe = (n: number) => (Number.isFinite(n) ? n : 0);
    return list.map((r) => {
      const buyAmt = Math.round(safe(r.buy) * safe(r.close));
      const sellAmt = Math.round(safe(r.sell) * safe(r.close));
      const diff = Math.round(safe(r.net) * safe(r.close));
      // 用「代碼 空格 名稱」讓後續 parseCodeName 的 fallback 能解析
      return {
        broker: `${r.code} ${r.name}`,
        buyAmt,
        sellAmt,
        diff,
        date: r.date,
      };
    });
  }

  /** 投信買超一日 */
  private async _fetchTrustInvestDaily(url: string): Promise<TrustBuyRow[]> {
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    const rows: TrustBuyRow[] = [];

    const date = this.dateForTrustInvest(html) || '';

    $('table tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 8) return;

      const rankTxt = $(tds[0]).text().trim();
      const rank = Number.parseInt(rankTxt, 10);
      if (!Number.isFinite(rank)) return;

      const nameCode = $(tds[1]).text().trim(); // 例如 "2330 台積電"
      const [code, ...nameParts] = nameCode.split(/\s+/);
      if (!code) return;
      const name = nameParts.join(' ').trim();

      const close = this.toNumber($(tds[2]).text());
      const change = $(tds[3]).text().trim();
      const changePct = $(tds[4]).text().trim();
      const buy = this.toNumber($(tds[5]).text());
      const sell = this.toNumber($(tds[6]).text());
      const net = this.toNumber($(tds[7]).text());

      rows.push({
        date,
        rank,
        code,
        name,
        close,
        change,
        changePct,
        buy,
        sell,
        net,
      });
    });

    return rows.filter((r) => r.code !== '').sort((a, b) => a.rank - b.rank);
  }

  /** 核心抓取：富邦「券商進出」頁 */
  private async _fubonCrawler(
    a: string,
    b: string,
    c: string,
    d: string,
  ): Promise<BrokerFlowRow[]> {
    const search = new URLSearchParams({ a, b, c, d });
    const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zg/zgb/zgb0.djhtm?${search.toString()}`;
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    const date = this.dateForBrokerFlow(html) || '';

    // 找最像資料表的 table（欄數>=4 且數字列較多）
    const tables = $('table').toArray();
    let targetTable: cheerio.Cheerio | null = null;
    let bestScore = -1;

    for (const t of tables) {
      const $t = $(t);
      const trs = $t.find('tr');
      let numericRows = 0;
      trs.each((__, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 4) {
          const nums = [
            tds.eq(1).text(),
            tds.eq(2).text(),
            tds.eq(3).text(),
          ].map((s) => s.replace(/[,]/g, '').trim());
          const ok = nums.filter((s) => /^-?\d+(\.\d+)?$/.test(s)).length;
          if (ok >= 2) numericRows += 1;
        }
      });
      if (numericRows > bestScore) {
        bestScore = numericRows;
        targetTable = $t;
      }
    }

    if (!targetTable) return [];

    const rows: BrokerFlowRow[] = [];
    targetTable.find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return;

      // 用 html() 才能抓到內嵌的 GenLink2stk(...)
      const cellHtml = tds.eq(0).html();
      const cellText = tds.eq(0).text();
      const broker = (cellHtml ?? cellText).trim();
      if (!broker || broker.includes('合計') || broker.includes('總計')) return;

      const buyAmt = this.toNumber(tds.eq(1).text());
      const sellAmt = this.toNumber(tds.eq(2).text());
      const diff = this.toNumber(tds.eq(3).text());

      if (buyAmt === 0 && sellAmt === 0 && diff === 0) return;

      rows.push({ date, broker, buyAmt, sellAmt, diff });
    });

    return rows;
  }
  /**
   * 任意家券商「同時買超」交集清單。
   * @param lists BrokerFlowRow 的二維陣列；每個內層陣列是某一家來源的清單
   * @param options.sortBy 'sum' 以所有家買入總和排序（預設）、'first' 以第一家買入排序
   * @param options.labels 與 lists 等長；若未提供則自動產生 ['#1', '#2', ...]
   * @param options.requireAll 預設 true：要所有清單都出現；false 則可指定最少出現家數 minAppear
   * @param options.minAppear 當 requireAll=false 時生效，預設 2
   * @param options.overlapMode 'all' 要所有清單都出現（等同 requireAll=true）、'atLeast' 至少 minAppear 家、'max' 出現最多家的（不需指定 minAppear）；預設 'atLeast'
   */
  overlapBrokers(
    lists: BrokerFlowRow[][],
    options: {
      sortBy?: 'sum' | 'first';
      labels?: string[];
      requireAll?: boolean; // 仍保留，向下相容
      minAppear?: number; // 仍保留，向下相容
      overlapMode?: 'all' | 'atLeast' | 'max'; // ★ 新增
    } = {},
  ): { count: number; data: OverlapItem[] } {
    const sortBy = options.sortBy ?? 'sum';
    const overlapMode =
      options.overlapMode ?? (options.requireAll ? 'all' : 'atLeast');
    const minAppear = Math.max(2, options.minAppear ?? 2);

    if (!lists?.length) return { count: 0, data: [] };

    // 1) 每家：標準化 + 只留買超 + 同家內合併
    const mergedPerBroker: Map<string, NormalizedBrokerRow>[] = lists.map(
      (r) => {
        const n = this.normalizeRows(r).filter(
          (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
        );
        return this.mergeByCode(n); // Map<code, row>
      },
    );

    // 2) 產生標籤
    const labels =
      options.labels && options.labels.length === mergedPerBroker.length
        ? options.labels
        : Array.from({ length: mergedPerBroker.length }, (_, i) => `#${i + 1}`);

    // 3) 蒐集所有代碼出現次數
    const appearCount = new Map<string, number>();
    for (const m of mergedPerBroker) {
      for (const code of m.keys()) {
        appearCount.set(code, (appearCount.get(code) ?? 0) + 1);
      }
    }

    // 3.5) 依照 overlapMode 決定門檻
    let needAppear: number;
    if (overlapMode === 'all') {
      needAppear = mergedPerBroker.length;
    } else if (overlapMode === 'max') {
      // ★ 最多交集：找出最大出現次數
      let maxCnt = 0;
      for (const cnt of appearCount.values()) maxCnt = Math.max(maxCnt, cnt);
      needAppear = maxCnt;
    } else {
      // 'atLeast'
      needAppear = minAppear;
    }

    // 4) 建立結果
    const result: OverlapItem[] = [];
    for (const [code, cnt] of appearCount) {
      if (cnt < needAppear) continue;

      const rows = mergedPerBroker.map((m) => m.get(code) ?? null);
      const any = rows.find((r) => r);
      if (!any) continue;

      let sumBuyAmt = 0,
        sumSellAmt = 0,
        sumDiff = 0;

      const brokers = rows.map((r, idx) => {
        const buyAmt = r?.buyAmt ?? 0;
        const sellAmt = r?.sellAmt ?? 0;
        const diff = r?.diff ?? 0;
        sumBuyAmt += buyAmt;
        sumSellAmt += sellAmt;
        sumDiff += diff;

        // ★ 若 OverlapItem 型別限制 idx: 1 | 2 | 3 之類，做窄化轉型
        const safeIdx = (idx + 1) as 1 | 2 | 3; // 視最多幾家調整

        return {
          idx: safeIdx,
          label: labels[idx],
          buyAmt,
          sellAmt,
          diff,
        };
      });

      result.push({
        code,
        name: any.name,
        brokers,
        sumBuyAmt,
        sumSellAmt,
        sumDiff,
      });
    }

    // 5) 排序（先依需求排序，再可選 tie-breaker）
    result.sort((a, b) => {
      if (sortBy === 'first') {
        return (
          (b.brokers[0]?.buyAmt ?? 0) - (a.brokers[0]?.buyAmt ?? 0) ||
          b.sumBuyAmt - a.sumBuyAmt
        );
      }
      return b.sumBuyAmt - a.sumBuyAmt;
    });

    return { count: result.length, data: result };
  }

  /** 產生文字報告 */
  buildBrokersText(
    payload: BrokersPayload,
    date: string,
    text: string,
    day: number,
  ): string {
    const lines: string[] = [];
    lines.push(
      `📊 ${text} \n${day.toString()}日重疊清單 （共${payload.count}檔）\n日期:${date}`,
    );
    payload.data.forEach((it, i) => {
      lines.push(`\n${i + 1}. ${it.code} ${it.name}`);
    });

    return lines.join('\n');
  }

  checkAllDateAreSame(lists: BrokerFlowRow[][]): string {
    // 過濾掉空清單
    const nonEmpty = lists.filter((r) => r.length > 0);
    if (!nonEmpty.length) return '';

    // 每個清單抽日期 → 去掉空/null → 去重
    const sets = nonEmpty.map(
      (r) => new Set(r.map((x) => (x.date ?? '').trim()).filter(Boolean)),
    );

    // 如果有任何一個 Set 不是單一日期，直接 return ''
    if (sets.some((s) => s.size !== 1)) return '';

    // 把每個 Set 唯一的日期取出
    const dates = sets.map((s) => [...s][0]);

    // 檢查是否一致
    const first = dates[0];
    return dates.every((d) => d === first) ? first : '';
  }

  // 三家同時買超（固定三家：台灣摩根士丹利、新加坡商瑞銀 + 投信(估)）
  async getOverlapAllFixed_a(day: number) {
    const [t1, t2, r1, r2] = await Promise.all([
      this.fetchTrustInvestListed(day.toString()), // 投信(估)-上市
      this.fetchTrustInvestOTC(day.toString()), // 投信(估)-上櫃
      this.fetchBrokerFlow({ a: 1470, b: 1470, c: 'B', d: day }), // 台灣摩根士丹利
      this.fetchBrokerFlow({ a: 1650, b: 1650, c: 'B', d: day }), // 新加坡商瑞銀
    ]);
    const r3 = this.trustToBroker(t1); // 投信轉券商格式（估）
    const r4 = this.trustToBroker(t2); // 投信轉券商格式（估）

    const result = this.overlapBrokers([r1, r2, r3, r4], {
      sortBy: 'sum',
      labels: [
        '台灣摩根士丹利',
        '新加坡商瑞銀',
        '投信(估)-上市',
        '投信(估)-上櫃',
      ],
      overlapMode: 'max',
    });

    const date = this.checkAllDateAreSame([r1, r2, r3, r4]) || '';
    return {
      result,
      date,
    };
  }

  // 兩家同時買超（固定兩家：新加坡商瑞銀 + 投信(估)）
  async getOverlapAllFixed_b(day: number) {
    const [t1, t2, r1] = await Promise.all([
      this.fetchTrustInvestListed(day.toString()), // 投信(估)-上市
      this.fetchTrustInvestOTC(day.toString()), // 投信(估)-上櫃
      this.fetchBrokerFlow({ a: 1650, b: 1650, c: 'B', d: day }), // 新加坡商瑞銀
    ]);
    const r2 = this.trustToBroker(t1); // 投信轉券商格式（估）
    const r3 = this.trustToBroker(t2); // 投信轉券商格式（估）

    const result = this.overlapBrokers([r1, r2, r3], {
      sortBy: 'sum',
      labels: ['新加坡商瑞銀', '投信(估)-上市', '投信(估)-上櫃'],
      overlapMode: 'max',
    });

    const date = this.checkAllDateAreSame([r1, r2, r3]) || '';
    return {
      result,
      date,
    };
  }

  // 兩家同時買超（固定兩家：台灣摩根士丹利 + 投信(估)）
  async getOverlapAllFixed_c(day: number) {
    const [t1, t2, r1] = await Promise.all([
      this.fetchTrustInvestListed(day.toString()), // 投信(估)-上市
      this.fetchTrustInvestOTC(day.toString()), // 投信(估)-上櫃
      this.fetchBrokerFlow({ a: 1470, b: 1470, c: 'B', d: day }), // 台灣摩根士丹利
    ]);
    const r2 = this.trustToBroker(t1); // 投信轉券商格式（估）
    const r3 = this.trustToBroker(t2); // 投信轉券商格式（估）

    const result = this.overlapBrokers([r1, r2, r3], {
      sortBy: 'sum',
      labels: ['台灣摩根士丹利', '投信(估)-上市', '投信(估)-上櫃'],
      overlapMode: 'max',
    });

    const date = this.checkAllDateAreSame([r1, r2, r3]) || '';
    return {
      result,
      date,
    };
  }

  // 兩家同時買超（固定兩家：富邦新店 + 投信(估)）
  async getOverlapAllFixed_d(day: number) {
    const [t1, t2, r1] = await Promise.all([
      this.fetchTrustInvestListed(day.toString()), // 投信(估)-上市
      this.fetchTrustInvestOTC(day.toString()), // 投信(估)-上櫃
      this.fetchBrokerFlow({ a: 9600, b: 9661, c: 'B', d: day }), // 富邦新店
    ]);
    const r2 = this.trustToBroker(t1); // 投信轉券商格式（估）
    const r3 = this.trustToBroker(t2); // 投信轉券商格式（估）

    const result = this.overlapBrokers([r1, r2, r3], {
      sortBy: 'sum',
      labels: ['富邦新店', '投信(估)-上市', '投信(估)-上櫃'],
      overlapMode: 'max',
    });

    const date = this.checkAllDateAreSame([r1, r2, r3]) || '';
    return {
      result,
      date,
    };
  }

  private dateForTrustInvest(html: string): string | undefined {
    const $ = cheerio.load(html);

    // 只取文字裡含「日期」的 .t11，避免抓到同 class 的其他元素
    const raw = $('div.t11')
      .filter((_, el) => $(el).text().includes('日期'))
      .first()
      .text()
      .trim(); // 例： "日期：08/26"

    if (!raw) return;

    // 先找 YYYY/MM/DD 或 YYYY-MM-DD
    const ymd = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (ymd) {
      const [_, y, m, d] = ymd;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 再找 MM/DD（頁面只顯示月日的情況）
    const md = raw.match(/(\d{1,2})[\/-](\d{1,2})/);
    if (md) {
      const now = new Date();
      let y = now.getFullYear();
      const m = Number(md[1]);
      const d = Number(md[2]);
      // 若今天是 1 月但頁面顯示 12 月，視為去年的資料
      if (now.getMonth() + 1 === 1 && m === 12) y -= 1;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  private dateForBrokerFlow(raw: string): string | undefined {
    // 去空白，容許「資料日期:」「資料日期：」
    const cleaned = raw.replace(/\s+/g, '');
    const m = cleaned.match(/資料日期[:：]?(\d{4})(\d{2})(\d{2})/);
    if (!m) return;

    const [, y, mm, dd] = m;
    return `${y}-${mm}-${dd}`; // -> 2025-08-25
  }
}
