// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { CrawlerJob } from './crawlerJob';
import { TsmcStockPriceTask } from './tsmcStockPriceTask.service';
import { CRON_TASK } from './types';

@Module({
  imports: [LineModule],
  providers: [
    CrawlerJob,
    TsmcStockPriceTask,
    {
      provide: CRON_TASK,
      useExisting: TsmcStockPriceTask,
    },
  ],
})
export class JobsModule {}
