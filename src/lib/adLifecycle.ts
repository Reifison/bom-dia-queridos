export type AdLifecycleEvent = 'showed' | 'dismissed' | 'failedToShow' | 'rewarded';

export type AdLifecycleListener = (payload?: unknown) => void;
export type AdLifecycleCleanup = () => void | Promise<void>;
export type AdLifecycleSubscribe = (
  event: AdLifecycleEvent,
  listener: AdLifecycleListener,
) => AdLifecycleCleanup | Promise<AdLifecycleCleanup>;

export type AdLifecycleOutcome =
  | 'completed'
  | 'dismissed-without-reward'
  | 'dismissed-before-show'
  | 'failed-to-show'
  | 'invoke-error'
  | 'listener-error'
  | 'timeout-before-show'
  | 'timeout-before-dismiss';

export interface AdLifecycleResult {
  success: boolean;
  shown: boolean;
  rewarded: boolean;
  outcome: AdLifecycleOutcome;
  reward?: unknown;
}

export interface WaitForAdLifecycleOptions {
  subscribe: AdLifecycleSubscribe;
  invoke: () => unknown | Promise<unknown>;
  requireReward?: boolean;
  initialTimeoutMs: number;
  dismissalTimeoutMs: number;
}

/**
 * Waits for a native fullscreen ad lifecycle without trusting the native
 * show/reward Promise as a dismissal signal. The Promise resolves only after
 * dismissal/failure or an explicitly classified timeout, and always removes
 * every listener it installed.
 */
export async function waitForAdLifecycle(
  options: WaitForAdLifecycleOptions,
): Promise<AdLifecycleResult> {
  let resolveResult: (result: AdLifecycleResult) => void = () => undefined;
  let settled = false;
  let shown = false;
  let rewarded = false;
  let reward: unknown;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;
  let dismissalTimer: ReturnType<typeof setTimeout> | undefined;

  const resultPromise = new Promise<AdLifecycleResult>((resolve) => {
    resolveResult = resolve;
  });

  const clearTimers = (): void => {
    if (initialTimer) clearTimeout(initialTimer);
    if (dismissalTimer) clearTimeout(dismissalTimer);
  };

  const finish = (outcome: AdLifecycleOutcome, success: boolean): void => {
    if (settled) return;
    settled = true;
    clearTimers();
    resolveResult({ success, shown, rewarded, outcome, reward });
  };

  const startDismissalWatchdog = (): void => {
    if (settled) return;
    if (initialTimer) clearTimeout(initialTimer);
    if (dismissalTimer) clearTimeout(dismissalTimer);
    dismissalTimer = setTimeout(
      () => finish('timeout-before-dismiss', false),
      options.dismissalTimeoutMs,
    );
  };

  const onShowed = (): void => {
    if (settled) return;
    shown = true;
    startDismissalWatchdog();
  };

  const onRewarded = (payload?: unknown): void => {
    if (settled) return;
    rewarded = true;
    reward = payload;
  };

  const onDismissed = (): void => {
    if (!shown) {
      finish('dismissed-before-show', false);
      return;
    }
    if (options.requireReward && !rewarded) {
      finish('dismissed-without-reward', false);
      return;
    }
    finish('completed', true);
  };

  const onFailedToShow = (): void => {
    finish('failed-to-show', false);
  };

  const cleanups: AdLifecycleCleanup[] = [];
  try {
    cleanups.push(await options.subscribe('showed', onShowed));
    cleanups.push(await options.subscribe('dismissed', onDismissed));
    cleanups.push(await options.subscribe('failedToShow', onFailedToShow));
    if (options.requireReward) cleanups.push(await options.subscribe('rewarded', onRewarded));
  } catch {
    finish('listener-error', false);
  }

  if (!settled) {
    initialTimer = setTimeout(
      () => finish('timeout-before-show', false),
      options.initialTimeoutMs,
    );

    Promise.resolve()
      .then(options.invoke)
      .catch(() => {
        // A native bridge can reject after presentation has already started;
        // let the lifecycle/watchdog classify that open ad instead of ending
        // it while it is still interactive.
        if (!shown) finish('invoke-error', false);
      });
  }

  const result = await resultPromise;
  await Promise.allSettled(
    cleanups.map(async (cleanup) => {
      try {
        await cleanup();
      } catch {
        // Listener cleanup is best-effort; the lifecycle has already settled.
      }
    }),
  );
  return result;
}
