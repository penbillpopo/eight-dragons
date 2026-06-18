export type TSearchType = 'buy' | 'sell';

export interface CronTask {
  run(): Promise<void> | void;
}

export const CRON_TASK = Symbol('CRON_TASK');
