// src/crawler/crawler.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('crawler')
export class CrawlerController {
  constructor(private readonly crawler: CrawlerService) {}

  // 投信買超一日
  @Get('trust-buy-daily')
  async trustBuyDaily() {
    const data = await this.crawler.fetchTrustInvestListed('1');
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
    return await this.crawler.getOverlapAllFixed_a(1);
  }
}
