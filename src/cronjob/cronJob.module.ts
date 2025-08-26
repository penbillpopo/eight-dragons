// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { CrawlerModule } from '../crawler/crawler.module';
import { LineModule } from '../line/line.module';
import { CrawlerJobJob } from './crawlerJob';

@Module({
  imports: [CrawlerModule, LineModule],
  providers: [CrawlerJobJob],
})
export class JobsModule {}
