import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded, raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors();
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // 只有 LINE webhook 路徑用 raw 以便簽章驗證
  app.use('/line/webhook', raw({ type: '*/*' }));
  await app.listen(3000);
}
bootstrap();
