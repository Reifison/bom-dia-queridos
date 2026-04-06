export type PeriodId = 'morning' | 'afternoon' | 'night';

export interface Period {
  id: PeriodId;
  title: string;
  subtitle: string;
  tag: string;
  image: string;
  isEnabled: boolean;
}

export interface DailyMessage {
  periodId: PeriodId;
  mainText: string;
  quote?: string;
  image: string;
}
