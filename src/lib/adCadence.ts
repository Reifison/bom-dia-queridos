/**
 * Local cadence state for interstitials and rewarded generation credits.
 *
 * This module is intentionally independent from the ad SDK. The caller should
 * register an interstitial only after the SDK confirms that it was shown.
 */

export const INTERSTITIAL_MESSAGE_THRESHOLD = 2;
export const INTERSTITIAL_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const REWARDED_CREDITS_PER_GRANT = 2;

export type AdPeriod = string;

export interface AdCadenceState {
  localDate: string;
  messagesOpenedSinceInterstitial: number;
  lastInterstitialShownAt: number | null;
  generationCredits: Record<AdPeriod, number>;
}

const STORAGE_KEY = "bom-dia-queridos.ad-cadence.v1";

let memoryState: AdCadenceState | null = null;

function getLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyState(localDate = getLocalDate()): AdCadenceState {
  return {
    localDate,
    messagesOpenedSinceInterstitial: 0,
    lastInterstitialShownAt: null,
    generationCredits: {},
  };
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

function cloneState(state: AdCadenceState): AdCadenceState {
  return {
    ...state,
    generationCredits: { ...state.generationCredits },
  };
}

function isValidState(value: unknown): value is AdCadenceState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdCadenceState>;
  return (
    typeof candidate.localDate === "string" &&
    typeof candidate.messagesOpenedSinceInterstitial === "number" &&
    Number.isFinite(candidate.messagesOpenedSinceInterstitial) &&
    candidate.messagesOpenedSinceInterstitial >= 0 &&
    (candidate.lastInterstitialShownAt === null ||
      (typeof candidate.lastInterstitialShownAt === "number" &&
        Number.isFinite(candidate.lastInterstitialShownAt))) &&
    !!candidate.generationCredits &&
    typeof candidate.generationCredits === "object"
  );
}

function readState(): AdCadenceState {
  const today = getLocalDate();
  let state: AdCadenceState | null = null;

  const storage = getStorage();
  if (storage) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isValidState(parsed)) state = cloneState(parsed);
      }
    } catch {
      // Private browsing, disabled storage, and malformed data are supported.
    }
  }

  state ??= memoryState ? cloneState(memoryState) : emptyState(today);

  if (state.localDate !== today) {
    state = emptyState(today);
    writeState(state);
  }

  memoryState = cloneState(state);
  return state;
}

function writeState(state: AdCadenceState): void {
  memoryState = cloneState(state);
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory copy when persistent storage is unavailable/quota-full.
  }
}

/** Returns a snapshot of today's cadence state. */
export function getAdCadenceState(): AdCadenceState {
  return cloneState(readState());
}

/** Resets all cadence counters and credits for the current local date. */
export function resetAdCadenceForLocalDate(): AdCadenceState {
  const state = emptyState();
  writeState(state);
  return cloneState(state);
}

/** Registers that a message was opened and returns today's opening count. */
export function registerMessageOpening(): number {
  const state = readState();
  state.messagesOpenedSinceInterstitial += 1;
  writeState(state);
  return state.messagesOpenedSinceInterstitial;
}

/**
 * Checks whether an interstitial is eligible right now.
 * The caller must also respect SDK availability and consent before showing it.
 */
export function shouldShowInterstitial(
  now = Date.now(),
  minimumMessages = INTERSTITIAL_MESSAGE_THRESHOLD,
  minimumIntervalMs = INTERSTITIAL_MIN_INTERVAL_MS,
): boolean {
  const state = readState();
  const intervalElapsed =
    state.lastInterstitialShownAt === null ||
    now - state.lastInterstitialShownAt >= minimumIntervalMs;

  return state.messagesOpenedSinceInterstitial >= minimumMessages && intervalElapsed;
}

/** Registers an interstitial after it was actually shown by the ad SDK. */
export function registerInterstitialShown(shownAt = Date.now()): void {
  const state = readState();
  state.messagesOpenedSinceInterstitial = 0;
  state.lastInterstitialShownAt = shownAt;
  writeState(state);
}

/** Grants the two credits earned by watching the rewarded-ad sequence. */
export function grantRewardedGenerationCredits(period: AdPeriod): number {
  const state = readState();
  const current = state.generationCredits[period] ?? 0;
  state.generationCredits[period] = current + REWARDED_CREDITS_PER_GRANT;
  writeState(state);
  return state.generationCredits[period];
}

/** Consumes one extra generation credit for the supplied period. */
export function consumeGenerationCredit(period: AdPeriod): boolean {
  const state = readState();
  const current = state.generationCredits[period] ?? 0;
  if (current <= 0) return false;

  state.generationCredits[period] = current - 1;
  writeState(state);
  return true;
}

/** Returns the number of remaining extra generation credits for a period. */
export function getGenerationCredits(period: AdPeriod): number {
  return readState().generationCredits[period] ?? 0;
}
