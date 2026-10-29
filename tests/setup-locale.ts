// Keep legacy fixtures deterministic regardless of the test machine's language.
// Locale-specific tests supply their own locale or native window preference.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'pt-BR', languages: ['pt-BR'] },
});
