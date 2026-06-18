// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { CrawlerJob } from './crawlerJob';
import { StockPriceTask } from './stockPriceTask.service';
import { CRON_TASK } from './types';

@Module({
  imports: [LineModule],
  providers: [
    CrawlerJob,
    StockPriceTask,
    {
      provide: CRON_TASK,
      useExisting: StockPriceTask,
    },
  ],
})
export class JobsModule {}
