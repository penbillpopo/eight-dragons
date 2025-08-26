// src/line/webhook.controller.ts
import { Controller, Post, Req, Res } from '@nestjs/common';
import { validateSignature } from '@line/bot-sdk';
import type { WebhookRequestBody } from '@line/bot-sdk'; // ✅ 根層匯入
import type { Request as ExpressRequest, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { LineService } from './line.service';

// 這條路徑在 main.ts 有套 raw()，所以 body 是 Buffer
type RawBodyRequest = ExpressRequest<ParamsDictionary, unknown, Buffer>;

@Controller('line')
export class WebhookController {
  constructor(private readonly line: LineService) {}

  @Post('webhook')
  async handle(@Req() req: RawBodyRequest, @Res() res: Response) {
    const sigHeader = req.headers['x-line-signature'];
    const signature = Array.isArray(sigHeader)
      ? (sigHeader[0] ?? '')
      : (sigHeader ?? '');
    const secret = process.env.LINE_CHANNEL_SECRET ?? '';

    const bodyString = req.body.toString('utf8');

    // 簽章驗證（官方函式）
    const ok = validateSignature(bodyString, secret, signature);
    if (!ok) return res.status(401).send('Invalid signature');

    // 解析 JSON → unknown → 型別守衛 → WebhookRequestBody
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyString) as unknown;
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!isWebhookRequestBody(parsed)) return res.status(400).send('Bad body');
    const body: WebhookRequestBody = parsed; // ✅ 強型別，無 any/unsafe

    // 使用具體事件型別（你也能用 webhook.Event，但這裡示範頂層別名 WebhookEvent）
    for (const event of body.events) {
      if (event.source.type === 'group') {
        const gid = event.source.groupId;
        console.log('Event in group:', gid);
        if (event.type === 'join') {
          try {
            await this.line.pushToGroup(
              gid,
              `大家好～我會每天下午6點推送三家同時買超，祝大家發大財！\n
              [GroupId: ${gid}]`,
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('pushMessage failed:', message);
          }
        }
      }
    }

    return res.status(200).send('OK');
  }
}

// --- 最小型別守衛：只檢查我們需要的結構 ---
function isWebhookRequestBody(x: unknown): x is WebhookRequestBody {
  return (
    typeof x === 'object' &&
    x !== null &&
    Array.isArray((x as { events?: unknown }).events)
  );
}
