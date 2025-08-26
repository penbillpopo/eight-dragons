// src/line/line.module.ts
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { LineService } from './line.service';

@Module({
  controllers: [WebhookController],
  providers: [LineService],
  exports: [LineService], // 若其他模組也想用 LineService，保留這行
})
export class LineModule {}
