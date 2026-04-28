/**
 * Contador persistente de visualizações de detalhe usado para decidir quando exibir o intersticial.
 *
 * Política (Apple Guideline 4 — Design): primeira visualização fica livre, intersticial dispara
 * a cada `INTERSTITIAL_AFTER_BACK_EVERY` voltas do detalhe para a home, depois reseta.
 * Persiste em `localStorage` para que matar/reabrir a app não ressuscite as visualizações livres.
 */

const STORAGE_KEY = 'bdq_detailBackCount';

/** Cada quantas voltas do detalhe → home dispara o intersticial. (1 livre, 2.ª com ad.) */
export const INTERSTITIAL_AFTER_BACK_EVERY = 2;

export function getDetailBackCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setDetailBackCount(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, n)));
  } catch {
    // quota / private mode — silently ignore; counter just won't persist.
  }
}

/**
 * Regista uma volta do detalhe para a home e devolve `true` se o intersticial deve disparar agora.
 * Quando devolve `true`, o contador já foi reposto a 0.
 */
export function registerDetailBackAndShouldShowAd(): boolean {
  const next = getDetailBackCount() + 1;
  if (next >= INTERSTITIAL_AFTER_BACK_EVERY) {
    setDetailBackCount(0);
    return true;
  }
  setDetailBackCount(next);
  return false;
}

export function resetDetailBackCount(): void {
  setDetailBackCount(0);
}
