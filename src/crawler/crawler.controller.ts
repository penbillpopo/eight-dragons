// src/crawler/crawler.controller.ts
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('crawler')
export class CrawlerController {
  constructor(private readonly crawler: CrawlerService) {}

  // 投信買超一日
  @Get('trust-buy-daily')
  async trustBuyDaily() {
    const data = await this.crawler.fetchTrustInvestListed('D', '1');
    return { count: data.length, data };
  }

  // 投信賣超一日
  @Get('trust-sell-daily')
  async trustSellDaily() {
    const data = await this.crawler.fetchTrustInvestListed('E', '1');
    return { count: data.length, data };
  }

  // 券商進出（固定：台灣摩根士丹利 1470）
  @Get('broker-flow-morgan-stanley')
  async brokerFlowMorganStanley() {
    const data = await this.crawler.fetchBrokerFlow('D', {
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
    const data = await this.crawler.fetchBrokerFlow('D', {
      a: 1650,
      b: 1650,
      c: 'B',
      d: 1,
    });
    return { count: data.length, data };
  }

  // 三家同時買/賣超（固定三家：1470、1650 + 投信(估)）
  @Get('overlap-three-fixed/:action')
  async overlapThreeFixed(@Param('action') action: 'buy' | 'sell') {
    if (action !== 'buy' && action !== 'sell') {
      throw new NotFoundException('Action must be "buy" or "sell"');
    }
    return await this.crawler.getOverlapAllFixed_a(1, action);
  }
}
