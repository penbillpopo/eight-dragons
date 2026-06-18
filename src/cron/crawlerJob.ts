import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_TASK } from './types';
import type { CronTask } from './types';

@Injectable()
export class CrawlerJob {
  constructor(@Inject(CRON_TASK) private readonly cronTask: CronTask) {}

  // 週一到週五 09:15、10:25、13:25 推送股價
  @Cron(process.env.CRON_TIME_0915 || '0 15 9 * * 1-5', {
    timeZone: 'Asia/Taipei',
  })
  @Cron(process.env.CRON_TIME_1025 || '0 25 10 * * 1-5', {
    timeZone: 'Asia/Taipei',
  })
  @Cron(process.env.CRON_TIME_1325 || '0 25 13 * * 1-5', {
    timeZone: 'Asia/Taipei',
  })
  async run() {
    await this.cronTask.run();
  }
}
