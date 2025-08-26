import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded, raw } from 'express';

async function bootstrap() {
  // 關掉內建 body-parser，避免先把 body 解析掉
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.enableCors();

  // 如果你有全域前綴（例如 app.setGlobalPrefix('api')），
  // 請把 WEBHOOK_PATH 改成 '/api/line/webhook'
  const WEBHOOK_PATH = '/line/webhook';

  // 1) 先掛 raw 在 Webhook 路徑（驗簽要用原始位元組）
  app.use(WEBHOOK_PATH, raw({ type: '*/*' }));

  // 2) 其他路徑再掛一般的 json / urlencoded
  app.use(json());
  app.use(urlencoded({ extended: true }));

  await app.listen(3000);
}
bootstrap();
