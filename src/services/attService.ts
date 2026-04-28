/**
 * AppTrackingTransparency (ATT) — Apple Guideline 2.1 (Information Needed).
 *
 * A Apple exige que a permissão de rastreamento seja solicitada ANTES de inicializar qualquer
 * SDK de anúncios (AdMob). Esta função deve ser aguardada antes de chamar
 * `ensureAdMobInitialized()` ou qualquer função do AdMob.
 *
 * Comportamento por plataforma:
 *  - iOS 14+: mostra o alerta nativo de ATT. AdMob deve correr após o resultado.
 *  - iOS < 14 / Android: getStatus() já devolve 'authorized'; sem alerta.
 *  - Web / browser: o plugin devolve 'authorized' sem mostrar nada.
 *
 * O estado é armazenado pelo sistema operativo — se o utilizador já respondeu, o prompt
 * não é mostrado novamente; `requestPermission()` devolve o estado guardado.
 */
import { AppTrackingTransparency } from '@capgo/capacitor-app-tracking-transparency';
import { Capacitor } from '@capacitor/core';
import { devLog } from '../lib/logger';

export type ATTStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted';

/**
 * Solicita a permissão ATT ao utilizador (ou lê o estado já guardado).
 * Resolve sempre — nunca rejeita — com o status final, seja qual for a resposta.
 * O AdMob deve ser inicializado dentro do `.then()` desta função.
 */
export async function requestTrackingPermission(): Promise<ATTStatus> {
  if (!Capacitor.isNativePlatform()) {
    return 'authorized';
  }
  try {
    const { status } = await AppTrackingTransparency.requestPermission();
    devLog.info('ATT status:', status);
    return status as ATTStatus;
  } catch (e) {
    // Se o plugin falhar (ex.: iOS < 14 sem framework), trata como autorizado para não
    // bloquear o SDK de anúncios — o rastreamento simplesmente não estará disponível.
    devLog.info('ATT requestPermission error (non-blocking):', e);
    return 'authorized';
  }
}
