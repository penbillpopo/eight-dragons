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
  @Cron('0 0 18 * * *', { timeZone: 'Asia/Taipei' })
  async run() {
    const { result, date } = await this.crawler.getOverlapAllFixed();
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

  @Cron('0 32 16 * * *', { timeZone: 'Asia/Taipei' })
  async runTest() {
    const { result, date } = await this.crawler.getOverlapAllFixed();
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID_TEST ?? '',
      this.crawler.buildBrokersText(result, date),
    );
  }
}
