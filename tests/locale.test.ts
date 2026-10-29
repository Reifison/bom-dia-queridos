import assert from 'node:assert/strict';
import test from 'node:test';
import { getAppLocale, resolveAppLocale, t } from '../src/lib/locale';

test('Portuguese regional variants select Portuguese', () => {
  for (const language of ['pt', 'pt-BR', 'pt-PT', 'pt-AO', 'pt-MZ', 'pt-CV', 'pt-GW', 'pt-ST', 'pt-TL', 'pt_GQ']) {
    assert.equal(resolveAppLocale([language]), 'pt');
  }
});

test('supported language preference wins over region and secondary languages', () => {
  assert.equal(resolveAppLocale(['en-BR', 'pt-BR']), 'en');
  assert.equal(resolveAppLocale(['pt-US', 'en-US']), 'pt');
  assert.equal(resolveAppLocale(['fr-FR', 'pt-PT', 'en-US']), 'pt');
  assert.equal(resolveAppLocale(['fr-FR']), 'en');
  assert.equal(resolveAppLocale([]), 'en');
});

test('translated UI preserves Portuguese and exposes English actions', () => {
  assert.equal(t('Compartilhar / Salvar', 'en'), 'Share / Save');
  assert.equal(t('Compartilhar / Salvar', 'pt'), 'Compartilhar / Salvar');
  assert.equal(t('Boa tarde', 'pt'), 'Boa tarde');
});

test('native app language takes priority over browser language', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { __appLocale: 'en' } });
    assert.equal(getAppLocale(), 'en');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { __appLocale: 'pt' } });
    assert.equal(getAppLocale(), 'pt');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
