// src/crawler/crawler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import retry from 'async-retry';
import { BrokerFlowRow, TrustBuyRow } from './types';

type NormalizedBrokerRow = {
  code: string;
  name: string;
  buyAmt: number;
  sellAmt: number;
  diff: number;
};

export type OverlapItem = {
  code: string;
  name: string;
  brokers: Array<{
    idx: 1 | 2 | 3;
    label: string; // 券商名稱（或來源標籤）
    buyAmt: number;
    sellAmt: number;
    diff: number;
  }>;
  sumBuyAmt: number;
  sumSellAmt: number;
  sumDiff: number;
};

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

  /** 投信買超一日（上市+上櫃合併） */
  async fetchTrustInvestDaily(): Promise<TrustBuyRow[]> {
    const url = 'https://fubon-ebrokerdj.fbs.com.tw/z/zg/zg_DD_0_1.djhtm';
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    const rows: TrustBuyRow[] = [];
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

      rows.push({ rank, code, name, close, change, changePct, buy, sell, net });
    });

    return rows.filter((r) => r.code !== '').sort((a, b) => a.rank - b.rank);
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
      return { broker: `${r.code} ${r.name}`, buyAmt, sellAmt, diff };
    });
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

      rows.push({ broker, buyAmt, sellAmt, diff });
    });

    return rows;
  }

  /**
   * 三家「同時買超」交集清單（直接吃三個 BrokerFlowRow[]）。
   * options.labels: 依序為三個來源的名稱（例如：['台灣摩根士丹利','新加坡瑞銀','投信(估)']）
   * options.sortBy: 'sum' 以三家買入總和排序、'first' 以第一家買入排序
   */
  overlapThreeBrokers(
    r1: BrokerFlowRow[],
    r2: BrokerFlowRow[],
    r3: BrokerFlowRow[],
    options: {
      sortBy?: 'sum' | 'first';
      labels?: [string, string, string];
    } = {},
  ): { count: number; data: OverlapItem[] } {
    const sortBy = options.sortBy ?? 'sum';
    const [label1, label2, label3] = options.labels ?? ['#1', '#2', '#3'];

    // 標準化 + 僅保留買超
    const n1 = this.normalizeRows(r1).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );
    const n2 = this.normalizeRows(r2).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );
    const n3 = this.normalizeRows(r3).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );

    // 合併同清單內重覆項目（若有）
    const m1 = this.mergeByCode(n1);
    const m2 = this.mergeByCode(n2);
    const m3 = this.mergeByCode(n3);

    const i2 = new Map<string, NormalizedBrokerRow>(
      [...m2.values()].map((x) => [x.code, x]),
    );
    const i3 = new Map<string, NormalizedBrokerRow>(
      [...m3.values()].map((x) => [x.code, x]),
    );

    const result: OverlapItem[] = [];
    for (const x of m1.values()) {
      const y = i2.get(x.code);
      if (!y) continue;
      const z = i3.get(x.code);
      if (!z) continue;

      const sumBuyAmt = x.buyAmt + y.buyAmt + z.buyAmt;
      const sumSellAmt = x.sellAmt + y.sellAmt + z.sellAmt;
      const sumDiff = x.diff + y.diff + z.diff;

      result.push({
        code: x.code,
        name: x.name,
        brokers: [
          {
            idx: 1,
            label: label1,
            buyAmt: x.buyAmt,
            sellAmt: x.sellAmt,
            diff: x.diff,
          },
          {
            idx: 2,
            label: label2,
            buyAmt: y.buyAmt,
            sellAmt: y.sellAmt,
            diff: y.diff,
          },
          {
            idx: 3,
            label: label3,
            buyAmt: z.buyAmt,
            sellAmt: z.sellAmt,
            diff: z.diff,
          },
        ],
        sumBuyAmt,
        sumSellAmt,
        sumDiff,
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'first') return b.brokers[0].buyAmt - a.brokers[0].buyAmt;
      return b.sumBuyAmt - a.sumBuyAmt;
    });

    return { count: result.length, data: result };
  }
}
