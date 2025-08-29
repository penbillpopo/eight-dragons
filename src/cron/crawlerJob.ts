// src/jobs/broker-push.job.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from '../crawler/crawler.service';
import { LineService } from '../line/line.service';
import { TSearchType } from './types';

@Injectable()
export class CrawlerJob {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly lineService: LineService,
  ) {}
  // 每天下午6點推送三家同時買超（固定三家：1470、1650 + 投信(估)）
  @Cron(process.env.CRON_TIME || '0 0 20 * * *', { timeZone: 'Asia/Taipei' })
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

    await this.sendOverlapMessage_e('新加坡商瑞銀/台灣摩根士丹利', 3);

    await this.sendOverlapMessage_a(
      '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
      1,
      'sell',
    );
    await this.sendOverlapMessage_a(
      '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
      5,
      'sell',
    );

    await this.sendOverlapMessage_b('新加坡商瑞銀/投信上市上櫃', 5, 'sell');

    await this.sendOverlapMessage_c('台灣摩根士丹利/投信上市上櫃', 5, 'sell');

    await this.sendOverlapMessage_d('富邦新店/台灣摩根士丹利', 5, 'sell');

    await this.sendOverlapMessage_e('新加坡商瑞銀/台灣摩根士丹利', 3, 'sell');
  }

  async sendOverlapMessage_a(
    text: string,
    day: number,
    searchType: TSearchType = 'buy',
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_a(
      day,
      searchType,
    );
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, searchType, date, text, day),
    );
  }

  async sendOverlapMessage_b(
    text: string,
    day: number,
    searchType: TSearchType = 'buy',
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_b(
      day,
      searchType,
    );
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, searchType, date, text, day),
    );
  }

  async sendOverlapMessage_c(
    text: string,
    day: number,
    searchType: TSearchType = 'buy',
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_c(
      day,
      searchType,
    );
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, searchType, date, text, day),
    );
  }

  async sendOverlapMessage_d(
    text: string,
    day: number,
    searchType: TSearchType = 'buy',
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_d(
      day,
      searchType,
    );
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, searchType, date, text, day),
    );
  }

  async sendOverlapMessage_e(
    text: string,
    day: number,
    searchType: TSearchType = 'buy',
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_e(
      day,
      searchType,
    );
    await this.lineService.pushToGroup(
      process.env.LINE_GROUP_ID ?? '',
      this.crawler.buildBrokersText(result, searchType, date, text, day),
    );
  }
}
