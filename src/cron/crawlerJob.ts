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
    await this.sendOverlapMessage(1);
    await this.sendOverlapMessage(5);
  }

  // @Cron('0 25 17 * * *', { timeZone: 'Asia/Taipei' })
  // async runTest() {
  //   await this.sendOverlapMessage(1);
  //   await this.sendOverlapMessage(5);
  // }

  async sendOverlapMessage(day: number) {
    const { result, date } = await this.crawler.getOverlapAllFixed(day);
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, date, day),
    );
  }
}
