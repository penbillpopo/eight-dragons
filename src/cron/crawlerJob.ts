import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_TASK } from './types';
import type { CronTask } from './types';

@Injectable()
export class CrawlerJob {
  constructor(@Inject(CRON_TASK) private readonly cronTask: CronTask) {}

  // 週一到週五 09:15 推送股價
  @Cron(process.env.CRON_TIME_0915 || '0 15 9 * * 1-5', {
    timeZone: 'Asia/Taipei',
    name: 'stock-price-0915',
  })
  async runAt0915() {
    await this.run();
  }

  // 週一到週五 10:25 推送股價
  @Cron(process.env.CRON_TIME_1025 || '0 25 10 * * 1-5', {
    timeZone: 'Asia/Taipei',
    name: 'stock-price-1025',
  })
  async runAt1025() {
    await this.run();
  }

  // 週一到週五 13:25 推送股價
  @Cron(process.env.CRON_TIME_1325 || '0 25 13 * * 1-5', {
    timeZone: 'Asia/Taipei',
    name: 'stock-price-1325',
  })
  async runAt1325() {
    await this.run();
  }

  private async run() {
    await this.cronTask.run();
  }
}
