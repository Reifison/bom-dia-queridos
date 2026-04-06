import { FEATURE_FLAGS } from './featureFlags';
import type { DailyMessage, Period, PeriodId } from '../types/period';

/** Unsplash thumbnails: fm=jpg evita AVIF/WebP no WKWebView (iOS/Capacitor). */
function us(id: string): string {
  return `https://images.unsplash.com/${id}?q=80&w=640&fit=crop&fm=jpg`;
}

export const PERIODS: Period[] = [
  {
    id: 'morning',
    title: 'BOM DIA',
    subtitle: 'Comece o dia com luz e gratidão.',
    tag: 'Manhã Radiante',
    image: us('photo-1470252649378-9c29740c9fa8'),
    isEnabled: FEATURE_FLAGS.ENABLE_MORNING,
  },
  {
    id: 'afternoon',
    title: 'BOA TARDE',
    subtitle: 'Um momento de pausa e calor no coração.',
    tag: 'Tarde Acolhedora',
    image: us('photo-1495584816685-4bdbf1b5057e'),
    isEnabled: FEATURE_FLAGS.ENABLE_AFTERNOON,
  },
  {
    id: 'night',
    title: 'BOA NOITE',
    subtitle: 'Descanse sob a paz das estrelas.',
    tag: 'Noite Serena',
    image: us('photo-1532767153582-b1a0e5145009'),
    isEnabled: FEATURE_FLAGS.ENABLE_NIGHT,
  },
];

export const INITIAL_MESSAGES: Record<PeriodId, DailyMessage> = {
  morning: {
    periodId: 'morning',
    mainText: 'Que o seu dia seja repleto de amor e esperança.',
    quote: "('O amor é a força mais poderosa do universo.' – Filme Uma Prova de Amor)",
    image: us('photo-1518895949257-7621c3c786d7'),
  },
  afternoon: {
    periodId: 'afternoon',
    mainText: 'Aproveite a tarde para respirar e recarregar as energias.',
    image: us('photo-1517849845537-4d257902454a'),
  },
  night: {
    periodId: 'night',
    mainText: 'Deixe as preocupações de lado e tenha um sono tranquilo.',
    quote:
      "('A felicidade pode ser encontrada mesmo nas horas mais sombrias, se a pessoa se lembrar de acender a luz.' – Harry Potter)",
    image: us('photo-1534361960057-19889db9621e'),
  },
};
