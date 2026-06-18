import { Injectable } from '@nestjs/common';
import { CrawlerService } from '../crawler/crawler.service';
import { LineService } from '../line/line.service';
import { TSearchType } from './types';

type SectionTask = {
  title: string;
  builder: () => Promise<string>;
};

@Injectable()
export class CrawlerReportTask {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly lineService: LineService,
  ) {}

  async run() {
    const tasks: SectionTask[] = [
      // ===== Buy =====
      {
        title: '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃（1日 買超）',
        builder: () =>
          this.buildOverlapMessage_a(
            '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
            1,
            'buy',
          ),
      },
      {
        title: '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃（5日 買超）',
        builder: () =>
          this.buildOverlapMessage_a(
            '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
            5,
            'buy',
          ),
      },
      {
        title: '新加坡商瑞銀/投信上市上櫃（5日 買超）',
        builder: () =>
          this.buildOverlapMessage_b('新加坡商瑞銀/投信上市上櫃', 5, 'buy'),
      },
      {
        title: '台灣摩根士丹利/投信上市上櫃（5日 買超）',
        builder: () =>
          this.buildOverlapMessage_c('台灣摩根士丹利/投信上市上櫃', 5, 'buy'),
      },
      {
        title: '富邦新店/台灣摩根士丹利（5日 買超）',
        builder: () =>
          this.buildOverlapMessage_d('富邦新店/台灣摩根士丹利', 5, 'buy'),
      },
      {
        title: '新加坡商瑞銀/台灣摩根士丹利（3日 買超）',
        builder: () =>
          this.buildOverlapMessage_e('新加坡商瑞銀/台灣摩根士丹利', 3, 'buy'),
      },

      // ===== Sell =====
      {
        title: '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃（1日 賣超）',
        builder: () =>
          this.buildOverlapMessage_a(
            '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
            1,
            'sell',
          ),
      },
      {
        title: '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃（5日 賣超）',
        builder: () =>
          this.buildOverlapMessage_a(
            '新加坡商瑞銀/台灣摩根士丹利/投信上市上櫃',
            5,
            'sell',
          ),
      },
      {
        title: '新加坡商瑞銀/投信上市上櫃（5日 賣超）',
        builder: () =>
          this.buildOverlapMessage_b('新加坡商瑞銀/投信上市上櫃', 5, 'sell'),
      },
      {
        title: '台灣摩根士丹利/投信上市上櫃（5日 賣超）',
        builder: () =>
          this.buildOverlapMessage_c('台灣摩根士丹利/投信上市上櫃', 5, 'sell'),
      },
      {
        title: '富邦新店/台灣摩根士丹利（5日 賣超）',
        builder: () =>
          this.buildOverlapMessage_d('富邦新店/台灣摩根士丹利', 5, 'sell'),
      },
      {
        title: '新加坡商瑞銀/台灣摩根士丹利（3日 賣超）',
        builder: () =>
          this.buildOverlapMessage_e('新加坡商瑞銀/台灣摩根士丹利', 3, 'sell'),
      },
    ];

    // 依序執行，空內容自動略過
    const sections: string[] = [];
    for (const t of tasks) {
      const body = await t.builder();
      if (body && body.trim().length > 0) {
        sections.push(this.formatSection(t.title, body));
      }
    }

    // 若皆為空則不送
    if (sections.length === 0) return;

    // 封面 + 內容
    const header = this.buildHeader();
    const separator = '\n━━━━━━━━━━━━━━━━━━━━\n';
    const finalText = `${header}${separator}${sections.join(separator)}`;

    // 自動分段（LINE 單則上限 5000 字，保守 4800）
    await this.lineService.pushLongText(
      process.env.LINE_GROUP_ID ?? '',
      finalText,
      separator,
    );
  }

  // ---------- Builders（只回傳字串，不推送） ----------
  private async buildOverlapMessage_a(
    text: string,
    day: number,
    searchType: TSearchType,
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_a(
      day,
      searchType,
    );
    return this.crawler.buildBrokersText(result, searchType, date, text, day);
  }

  private async buildOverlapMessage_b(
    text: string,
    day: number,
    searchType: TSearchType,
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_b(
      day,
      searchType,
    );
    return this.crawler.buildBrokersText(result, searchType, date, text, day);
  }

  private async buildOverlapMessage_c(
    text: string,
    day: number,
    searchType: TSearchType,
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_c(
      day,
      searchType,
    );
    return this.crawler.buildBrokersText(result, searchType, date, text, day);
  }

  private async buildOverlapMessage_d(
    text: string,
    day: number,
    searchType: TSearchType,
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_d(
      day,
      searchType,
    );
    return this.crawler.buildBrokersText(result, searchType, date, text, day);
  }

  private async buildOverlapMessage_e(
    text: string,
    day: number,
    searchType: TSearchType,
  ) {
    const { result, date } = await this.crawler.getOverlapAllFixed_e(
      day,
      searchType,
    );
    return this.crawler.buildBrokersText(result, searchType, date, text, day);
  }

  // ---------- UI helpers ----------
  private buildHeader(): string {
    const tz = 'Asia/Taipei';
    const dtf = new Intl.DateTimeFormat('zh-TW', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = Object.fromEntries(
      dtf.formatToParts(new Date()).map((p) => [p.type, p.value]),
    );

    const yyyy = parts.year;
    const mm = parts.month;
    const dd = parts.day;
    const hh = parts.hour;
    const mi = parts.minute;

    return `📅 ${yyyy}/${mm}/${dd} ${hh}:${mi} 券商重疊觀察彙整`;
  }

  private formatSection(title: string, body: string): string {
    // 區塊標題 + 內文，避免多餘空白
    const clean = body.trim();
    return `📊 ${title}\n${clean}`;
  }
}
