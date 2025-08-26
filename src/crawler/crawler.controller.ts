import { Controller, Get } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('crawler')
export class CrawlerController {
  constructor(private readonly crawler: CrawlerService) {}

  // 投信買超一日
  @Get('trust-buy-daily')
  async trustBuyDaily() {
    const data = await this.crawler.fetchTrustInvestDaily();
    return { count: data.length, data };
  }

  // 券商進出（固定：台灣摩根士丹利）
  @Get('broker-flow-morgan-stanley')
  async brokerFlowMorganStanley() {
    const data = await this.crawler.fetchMorganStanleyDaily();
    return { count: data.length, data };
  }

  // 券商進出（固定：新加坡商瑞銀）
  @Get('broker-flow-singapore')
  async brokerFlowSingapore() {
    const data = await this.crawler.fetchSingaporeDaily();
    return { count: data.length, data };
  }

  // 三家同時買超（券商參數直接寫死）
  @Get('overlap-three-fixed')
  async overlapThreeFixed() {
    const res = await this.crawler.overlapThreeBrokers(
      // 第一家：台灣摩根士丹利
      { a: 1470, b: 1470, c: 'B', d: 1 },
      // 第二家：新加坡商瑞銀
      { a: 1650, b: 1650, c: 'B', d: 1 },
      // 第三家：這裡示範隨便放一個（請換成你要的券商代碼）
      { a: 9800, b: 9800, c: 'B', d: 1 },
      'sum', // 排序方式：'sum' = 三家買入金額總和；'first' = 以第一家買入排序
    );
    return res;
  }
}
