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
export class TsmcStockPriceTask implements CronTask {
  private readonly logger = new Logger(TsmcStockPriceTask.name);
  private readonly stockInfoUrl =
    'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw&json=1&delay=0';

  constructor(private readonly lineService: LineService) {}

  async run() {
    const stock = await this.fetchTsmcStockInfo();
    const message = this.buildMessage(stock);

    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      message,
    );
  }

  private async fetchTsmcStockInfo(): Promise<TwseStockInfo> {
    const res = await fetch(this.stockInfoUrl, {
      headers: {
        Referer: 'https://mis.twse.com.tw/stock/fibest.jsp?stock=2330',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`TWSE stock API failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TwseStockInfoResponse;
    const stock = data.msgArray?.[0];

    if (data.rtcode && data.rtcode !== '0000') {
      throw new Error(`TWSE stock API error: ${data.rtcode} ${data.rtmessage}`);
    }

    if (!stock) {
      this.logger.error(JSON.stringify(data));
      throw new Error('TWSE stock API returned empty stock info');
    }

    return stock;
  }

  private buildMessage(stock: TwseStockInfo): string {
    const name = stock.n ?? '台積電';
    const code = stock.c ?? '2330';
    const priceValue = this.resolveCurrentPrice(stock);
    const price = this.formatPrice(priceValue);
    const previousClose = this.toNumber(stock.y);
    const change = priceValue - previousClose;
    const changePercent =
      previousClose === 0 ? 0 : (change / previousClose) * 100;
    const sign = change > 0 ? '+' : '';

    return [
      `台積電即時股價 ${name}(${code})`,
      `現價：${price}`,
      `漲跌：${sign}${this.formatNumber(change)} (${sign}${this.formatNumber(changePercent)}%)`,
      `開高低：${this.formatPrice(stock.o)} / ${this.formatPrice(stock.h)} / ${this.formatPrice(stock.l)}`,
      `成交量：${this.formatVolume(stock.v)} 張`,
      `資料時間：${this.formatDateTime(stock.d, stock.t)}`,
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

  private formatVolume(value?: string): string {
    const n = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(n)) return '-';

    return new Intl.NumberFormat('zh-TW').format(n);
  }

  private formatDateTime(date?: string, time?: string): string {
    if (!date || date.length !== 8) return time ?? '-';

    const yyyy = date.slice(0, 4);
    const mm = date.slice(4, 6);
    const dd = date.slice(6, 8);

    return `${yyyy}/${mm}/${dd} ${time ?? ''}`.trim();
  }
}
