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
  @Cron(process.env.CRON_TIME || '0 0 18 * * *', { timeZone: 'Asia/Taipei' })
  async run() {
    await this.sendOverlapMessage_a(
      '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
      1,
    );
    await this.sendOverlapMessage_a(
      '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
      5,
    );

    await this.sendOverlapMessage_b('新加坡商瑞銀/投信上市上櫃', 5);

    await this.sendOverlapMessage_c('台灣摩根士丹利/投信上市上櫃', 5);

    await this.sendOverlapMessage_d('富邦新店/台灣摩根士丹利', 5);
  }

  async sendOverlapMessage_a(text: string, day: number) {
    const { result, date } = await this.crawler.getOverlapAllFixed_a(day);
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, date, text, day),
    );
  }

  async sendOverlapMessage_b(text: string, day: number) {
    const { result, date } = await this.crawler.getOverlapAllFixed_b(day);
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, date, text, day),
    );
  }

  async sendOverlapMessage_c(text: string, day: number) {
    const { result, date } = await this.crawler.getOverlapAllFixed_c(day);
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, date, text, day),
    );
  }

  async sendOverlapMessage_d(text: string, day: number) {
    const { result, date } = await this.crawler.getOverlapAllFixed_d(day);
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, date, text, day),
    );
  }
}
