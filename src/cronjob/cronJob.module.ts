// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { CrawlerModule } from '../crawler/crawler.module';
import { LineModule } from '../line/line.module';
import { CrawlerJob } from './crawlerJob';

@Module({
  imports: [CrawlerModule, LineModule],
  providers: [CrawlerJob],
})
export class JobsModule {}
