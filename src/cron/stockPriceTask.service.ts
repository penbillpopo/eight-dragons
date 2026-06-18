import { Injectable, Logger } from '@nestjs/common';
import { LineService } from '../line/line.service';
import type { CronTask } from './types';

type TwseStockInfoResponse = {
  msgArray?: TwseStockInfo[];
  rtcode?: string;
  rtmessage?: string;
  queryTime?: {
    sysDate?: string;
    sysTime?: string;
  };
};

type TwseStockInfo = {
  c?: string;
  n?: string;
  z?: string;
  pz?: string;
  y?: string;
  o?: string;
  h?: string;
  l?: string;
  v?: string;
  d?: string;
  t?: string;
};

@Injectable()
export class StockPriceTask implements CronTask {
  private readonly logger = new Logger(StockPriceTask.name);
  private readonly stockInfoBaseUrl =
    'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
  private readonly defaultStocks = [
    '2330',
    '3481',
    '2327',
    '2383',
    '3037',
    '6415',
  ];

  constructor(private readonly lineService: LineService) {}

  async run() {
    const stocks = await this.fetchStockInfo();
    const message = this.buildMessage(stocks);

    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      message,
    );
  }

  private async fetchStockInfo(): Promise<TwseStockInfo[]> {
    const stockKeys = this.getStockKeys();
    const url = `${this.stockInfoBaseUrl}?ex_ch=${stockKeys.join('|')}&json=1&delay=0`;

    const res = await fetch(url, {
      headers: {
        Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`TWSE stock API failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TwseStockInfoResponse;
    const stocks = data.msgArray ?? [];

    if (data.rtcode && data.rtcode !== '0000') {
      throw new Error(`TWSE stock API error: ${data.rtcode} ${data.rtmessage}`);
    }

    if (stocks.length === 0) {
      this.logger.error(JSON.stringify(data));
      throw new Error('TWSE stock API returned empty stock info');
    }

    return stocks;
  }

  private getStockKeys(): string[] {
    const symbols = (process.env.STOCK_SYMBOLS ?? '')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const stocks = symbols.length > 0 ? symbols : this.defaultStocks;

    return stocks.map((stock) => {
      if (stock.includes('_')) return stock;

      return `tse_${stock}.tw`;
    });
  }

  private buildMessage(stocks: TwseStockInfo[]): string {
    const blocks = stocks.map((stock) => this.buildStockBlock(stock));
    const latest = stocks[0];

    return [
      ...blocks,
      '',
      `資料時間：${this.formatDateTime(latest?.d, latest?.t)}`,
    ].join('\n');
  }

  private buildStockBlock(stock: TwseStockInfo): string {
    const name = stock.n ?? '-';
    const code = stock.c ?? '-';
    const priceValue = this.resolveCurrentPrice(stock);
    const price = this.formatPrice(priceValue);
    const previousClose = this.toNumber(stock.y);
    const change = priceValue - previousClose;
    const sign = change > 0 ? '+' : '';

    return [
      `股票：${name}(${code})`,
      `現價：${price}`,
      `昨日收盤價：${this.formatPrice(stock.y)}`,
      `漲跌：${sign}${this.formatNumber(change)}`,
      '--------------------------',
    ].join('\n');
  }

  private toNumber(value?: string | number): number {
    const n =
      typeof value === 'number' ? value : Number.parseFloat(value ?? '');
    return Number.isFinite(n) ? n : 0;
  }

  private resolveCurrentPrice(stock: TwseStockInfo): number {
    return this.toNumber(stock.z) || this.toNumber(stock.pz);
  }

  private formatPrice(value?: string | number): string {
    const n = this.toNumber(value);
    return n === 0 ? '-' : this.formatNumber(n);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('zh-TW', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatDateTime(date?: string, time?: string): string {
    if (!date || date.length !== 8) return time ?? '-';

    const yyyy = date.slice(0, 4);
    const mm = date.slice(4, 6);
    const dd = date.slice(6, 8);

    return `${yyyy}/${mm}/${dd} ${time ?? ''}`.trim();
  }
}
