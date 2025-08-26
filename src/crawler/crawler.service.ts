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

type OverlapItem = {
  code: string;
  name: string;
  brokers: Array<{
    idx: 1 | 2 | 3;
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
              responseType: 'arraybuffer' as const, // Node 環境實際多半回 Buffer
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

        const data = res.data as unknown;

        // 1) 直接是 Buffer（Node 常見）
        if (Buffer.isBuffer(data)) {
          let html = iconv.decode(data, 'utf8');
          if (html.includes('�')) html = iconv.decode(data, 'cp950');
          return html;
        }

        // 2) 是 ArrayBuffer（較少見，但瀏覽器/部分環境可能）
        if (data instanceof ArrayBuffer) {
          const buf = Buffer.from(new Uint8Array(data));
          let html = iconv.decode(buf, 'utf8');
          if (html.includes('�')) html = iconv.decode(buf, 'cp950');
          return html;
        }

        // 3) 已經是字串（若某些代理/轉換發生）
        if (typeof data === 'string') {
          return data;
        }

        // 4) 其他型別，一律丟錯幫助除錯
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

  /** 解析 "<!-- GenLink2stk('AS2330','台積電'); //-->" 成 { code, name } */
  private parseCodeName(raw: string): { code: string; name: string } | null {
    // 去掉換行空白，避免換行影響
    const s = raw.replace(/\s+/g, ' ');
    const m = s.match(/GenLink2stk\('AS(\d+)','([^']+)'\)/);
    if (!m) return null;
    return { code: m[1], name: m[2] };
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

  /** 投信買超一日（上市+上櫃合併） */
  async fetchTrustInvestDaily(): Promise<TrustBuyRow[]> {
    const url = 'https://fubon-ebrokerdj.fbs.com.tw/z/zg/zg_DD_0_1.djhtm';
    const html: string = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    const rows: TrustBuyRow[] = [];
    $('table tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 8) return;

      // rank
      const rankTxt = $(tds[0]).text().trim();
      const rank = Number.parseInt(rankTxt, 10);
      if (!Number.isFinite(rank)) return;

      // 代碼 + 名稱（例如 "2330 台積電"）
      const nameCode = $(tds[1]).text().trim();
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

  /** 券商進出一日 台灣摩根士丹利 */
  async fetchMorganStanleyDaily(): Promise<BrokerFlowRow[]> {
    return await this._fubonCrawler('1470', '1470', 'B', '1');
  }

  /** 券商進出一日 新加坡商瑞銀 */
  async fetchSingaporeDaily(): Promise<BrokerFlowRow[]> {
    return await this._fubonCrawler('1650', '1650', 'B', '1');
  }

  /** 泛用：輸入 a/b/c/d/e/f 參數，抓券商進出 */
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
      trs.each((_, tr) => {
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

      const broker = tds.eq(0).text().trim();
      if (!broker || broker.includes('合計') || broker.includes('總計')) return;

      const buyAmt = this.toNumber(tds.eq(1).text());
      const sellAmt = this.toNumber(tds.eq(2).text());
      const diff = this.toNumber(tds.eq(3).text());

      // 至少有一個數字，避免把表頭或空列推進去
      if (buyAmt === 0 && sellAmt === 0 && diff === 0) return;

      rows.push({ broker, buyAmt, sellAmt, diff });
    });

    return rows;
  }

  /**
   * 三家券商「同時買超」交集清單。
   * - 先抓三家 → 只保留買超（diff>0 或 buyAmt>sellAmt）
   * - 交集（以股票代碼 code）
   * - 排序：預設以三家買入金額總和（sum）高到低；或以第一家（first）買入額排序
   */
  async overlapThreeBrokers(
    p1: {
      a: string | number;
      b: string | number;
      c?: string;
      d?: string | number;
      e?: string;
      f?: string;
    },
    p2: {
      a: string | number;
      b: string | number;
      c?: string;
      d?: string | number;
      e?: string;
      f?: string;
    },
    p3: {
      a: string | number;
      b: string | number;
      c?: string;
      d?: string | number;
      e?: string;
      f?: string;
    },
    sortBy: 'sum' | 'first' = 'sum',
  ): Promise<{ count: number; data: OverlapItem[] }> {
    const [r1, r2, r3] = await Promise.all([
      this.fetchBrokerFlow(p1),
      this.fetchBrokerFlow(p2),
      this.fetchBrokerFlow(p3),
    ]);

    const n1 = this.normalizeRows(r1).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );
    const n2 = this.normalizeRows(r2).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );
    const n3 = this.normalizeRows(r3).filter(
      (x) => x.diff > 0 || x.buyAmt > x.sellAmt,
    );

    const i2 = new Map<string, NormalizedBrokerRow>(n2.map((x) => [x.code, x]));
    const i3 = new Map<string, NormalizedBrokerRow>(n3.map((x) => [x.code, x]));

    const result: OverlapItem[] = n1
      .filter((x) => i2.has(x.code) && i3.has(x.code))
      .map((x) => {
        const y = i2.get(x.code)!;
        const z = i3.get(x.code)!;
        const sumBuyAmt = x.buyAmt + y.buyAmt + z.buyAmt;
        const sumSellAmt = x.sellAmt + y.sellAmt + z.sellAmt;
        const sumDiff = x.diff + y.diff + z.diff;
        return {
          code: x.code,
          name: x.name,
          brokers: [
            {
              idx: 1 as const,
              buyAmt: x.buyAmt,
              sellAmt: x.sellAmt,
              diff: x.diff,
            },
            {
              idx: 2 as const,
              buyAmt: y.buyAmt,
              sellAmt: y.sellAmt,
              diff: y.diff,
            },
            {
              idx: 3 as const,
              buyAmt: z.buyAmt,
              sellAmt: z.sellAmt,
              diff: z.diff,
            },
          ],
          sumBuyAmt,
          sumSellAmt,
          sumDiff,
        };
      });

    result.sort((a, b) => {
      if (sortBy === 'first') return b.brokers[0].buyAmt - a.brokers[0].buyAmt;
      return b.sumBuyAmt - a.sumBuyAmt; // 預設：三家買入金額總和
    });

    return { count: result.length, data: result };
  }
}
