import { Injectable } from '@nestjs/common';
import { messagingApi } from '@line/bot-sdk';

@Injectable()
export class LineService {
  private client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  // 單則純文字推送
  pushToGroup(groupId: string, text: string) {
    return this.client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text }],
    });
  }

  /**
   * 長訊息自動切割推送
   * - LINE 單則文字上限 5000，保守切到 4800
   * - 優先以分隔符拆段，避免切壞段落；不行再硬切
   */
  async pushLongText(groupId: string, text: string, preferredSep = '\n\n') {
    const LIMIT = 4800; // 保守一點
    const chunks = this.splitByLimit(text, LIMIT, preferredSep);

    // 順序推送，維持閱讀上下文
    for (const c of chunks) {
      await this.pushToGroup(groupId, c);
    }
  }

  private splitByLimit(
    text: string,
    limit: number,
    preferredSep: string,
  ): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    const sep = preferredSep || '\n';

    let remaining = text;

    while (remaining.length > limit) {
      // 優先找離上限最近的分隔點
      const slice = remaining.slice(0, limit);
      let idx = slice.lastIndexOf(sep);

      // 找不到就退而求其次，用段落或換行
      if (idx < limit * 0.6) {
        // 太前面就不要用，改找一般換行
        idx = Math.max(
          slice.lastIndexOf('\n━━━━━━━━━━━━━━━━━━━━\n'),
          slice.lastIndexOf('\n'),
        );
      }
      if (idx <= 0) idx = limit; // 還是找不到就硬切

      chunks.push(remaining.slice(0, idx));
      remaining = remaining.slice(idx);
    }

    if (remaining.trim().length > 0) chunks.push(remaining);

    return chunks.map((s) => s.trim()).filter((s) => s.length > 0);
  }
}
