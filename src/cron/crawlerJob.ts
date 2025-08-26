// src/jobs/broker-push.job.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from '../crawler/crawler.service';
import { LineService } from '../line/line.service';

@Injectable()
export class CrawlerJob {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly lineService: LineService,
  ) {}

  // 每天下午6點推送三家同時買超（固定三家：1470、1650 + 投信(估)）
  @Cron('0 7 18 * * *', { timeZone: 'Asia/Taipei' })
  async run() {
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
    const date = this.crawler.checkAllDateAreSame(r1, r2, r3);
    if (date) {
      await this.lineService.pushToGroup(
        process.env.LINE_GROUP_ID ?? '',
        this.crawler.buildBrokersText(result, date),
      );
    } else {
      await this.lineService.pushToGroup(
        process.env.LINE_GROUP_ID ?? '',
        `今日資料尚未更新,請稍後手動查詢\n
        https://eight-dragons.onrender.com/crawler/overlap-three-fixed
        `,
      );
    }
  }
}
