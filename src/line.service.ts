// line.service.ts
import { Injectable } from '@nestjs/common';
import { messagingApi } from '@line/bot-sdk';

@Injectable()
export class LineService {
  private client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  pushToGroup(groupId: string, text: string) {
    return this.client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text }],
    });
  }
}
