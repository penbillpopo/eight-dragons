// src/crawler/crawler.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { LineService } from 'src/line/line.service';

@Controller('crawler')
export class CrawlerController {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly lineService: LineService,
  ) {}

  // 投信買超一日
  @Get('trust-buy-daily')
  async trustBuyDaily() {
    const data = await this.crawler.fetchTrustInvestDaily();
    return { count: data.length, data };
  }

  // 券商進出（固定：台灣摩根士丹利 1470）
  @Get('broker-flow-morgan-stanley')
  async brokerFlowMorganStanley() {
    const data = await this.crawler.fetchBrokerFlow({
      a: 1470,
      b: 1470,
      c: 'B',
      d: 1,
    });
    return { count: data.length, data };
  }

  // 券商進出（固定：新加坡商瑞銀 1650）
  @Get('broker-flow-singapore')
  async brokerFlowSingapore() {
    const data = await this.crawler.fetchBrokerFlow({
      a: 1650,
      b: 1650,
      c: 'B',
      d: 1,
    });
    return { count: data.length, data };
  }

  // 三家同時買超（固定三家：1470、1650 + 投信(估)）
  @Get('overlap-three-fixed')
  async overlapThreeFixed() {
    const [trust, r1, r2] = await Promise.all([
      this.crawler.fetchTrustInvestDaily(),
      this.crawler.fetchBrokerFlow({ a: 1470, b: 1470, c: 'B', d: 1 }), // 台灣摩根士丹利
      this.crawler.fetchBrokerFlow({ a: 1650, b: 1650, c: 'B', d: 1 }), // 新加坡商瑞銀
    ]);
    const r3 = this.crawler.trustToBroker(trust); // 投信轉券商格式（估）

    const result = this.crawler.overlapThreeBrokers(r1, r2, r3, {
      sortBy: 'sum',
      labels: ['台灣摩根士丹利', '新加坡商瑞銀', '投信(估)'],
    });

    return result;
  }

  /**
   * 動態指定三家券商參數
   * 用法：
   * /crawler/overlap-three?a1=1470&b1=1470&c1=B&d1=1&a2=1650&b2=1650&c2=B&d2=1&a3=9800&b3=9800&c3=B&d3=1&sortBy=sum&label1=MS&label2=UBS&label3=Trust
   */
  @Get('overlap-three')
  async overlapThree(
    @Query('a1') a1: string,
    @Query('b1') b1: string,
    @Query('c1') c1?: string,
    @Query('d1') d1?: string,
    @Query('a2') a2?: string,
    @Query('b2') b2?: string,
    @Query('c2') c2?: string,
    @Query('d2') d2?: string,
    @Query('a3') a3?: string,
    @Query('b3') b3?: string,
    @Query('c3') c3?: string,
    @Query('d3') d3?: string,
    @Query('sortBy') sortBy: 'sum' | 'first' = 'sum',
    @Query('label1') label1?: string,
    @Query('label2') label2?: string,
    @Query('label3') label3?: string,
  ) {
    const [r1, r2, r3] = await Promise.all([
      this.crawler.fetchBrokerFlow({ a: a1, b: b1, c: c1, d: d1 }),
      this.crawler.fetchBrokerFlow({ a: a2 ?? a1, b: b2 ?? b1, c: c2, d: d2 }),
      this.crawler.fetchBrokerFlow({ a: a3 ?? a1, b: b3 ?? b1, c: c3, d: d3 }),
    ]);

    return this.crawler.overlapThreeBrokers(r1, r2, r3, {
      sortBy,
      labels: [label1 ?? '#1', label2 ?? '#2', label3 ?? '#3'],
    });
  }
}
