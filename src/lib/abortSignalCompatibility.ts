/** Firebase AI uses AbortSignal.any(), introduced after this app's minimum iOS. */
export function ensureAbortSignalAny(signalType: typeof AbortSignal = AbortSignal): void {
  if (typeof signalType.any === 'function') return;
  Object.defineProperty(signalType, 'any', {
    configurable: true,
    writable: true,
    value(signals: Iterable<AbortSignal>): AbortSignal {
      const controller = new AbortController();
      const subscriptions: Array<{ signal: AbortSignal; listener: () => void }> = [];
      const finish = (source: AbortSignal) => {
        if (controller.signal.aborted) return;
        for (const { signal, listener } of subscriptions) signal.removeEventListener('abort', listener);
        controller.abort(source.reason);
      };
      for (const signal of signals) {
        if (signal.aborted) { finish(signal); break; }
        const listener = () => finish(signal);
        subscriptions.push({ signal, listener });
        signal.addEventListener('abort', listener, { once: true });
      }
      return controller.signal;
    },
  });
}
