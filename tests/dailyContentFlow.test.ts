import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDailyContentFlow } from '../src/lib/dailyContentFlow';
import type { DailyQuota } from '../src/lib/dailyGeneration';
import type { BankSelection } from '../src/lib/personalImageBank';
import type { DailyMessage, PeriodId } from '../src/types/period';

const DAY = '2026-10-26';
const NEXT_DAY = '2026-10-27';
const IMAGE = 'data:image/jpeg;base64,aGVsbG8=';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function createHarness() {
  const state = {
    day: DAY,
    activePeriod: 'morning' as PeriodId,
    available: true,
    photo: null as string | null,
    beforeActionImpl: (_isCurrent: () => boolean): Promise<void> => Promise.resolve(),
    generateImpl: async (_period: PeriodId): Promise<string> => 'generated-image',
    prepareImpl: async (image: string): Promise<string> => `prepared:${image}`,
    saveImpl: async (_period: PeriodId, image: string, _day: string): Promise<BankSelection> => ({
      imageId: `saved:${image}`,
      image,
      source: 'firebase',
    }),
  };
  const messages = new Map<string, DailyMessage>();
  const quotas = new Map<string, DailyQuota>();
  const calls = {
    beforeAction: 0,
    events: [] as string[],
    selectImage: [] as Array<{ period: PeriodId; day: string; excludeImage?: string }>,
    selectText: [] as Array<{ period: PeriodId; day: string; excludeText?: string }>,
    generateAi: [] as Array<{ period: PeriodId }>,
    prepareAi: [] as string[],
    saveAi: [] as Array<{ period: PeriodId; image: string; day: string }>,
    pickPhoto: 0,
    writes: [] as Array<{ message: DailyMessage; day: string }>,
    quotaWrites: [] as DailyQuota[],
    busy: [] as Array<string | null>,
    errors: [] as Array<string | null>,
  };

  const key = (period: PeriodId, day: string) => `${day}:${period}`;
  const defaultMessage = (period: PeriodId): DailyMessage => ({
    periodId: period,
    mainText: `Mensagem inicial ${period}`,
    image: `/images/daily/${period}-01.jpg`,
    source: 'offline',
  });
  const readQuota = (day: string): DailyQuota => {
    const saved = quotas.get(day);
    return saved
      ? { day, remaining: { ...saved.remaining } }
      : { day, remaining: { morning: 1, afternoon: 1, night: 1 } };
  };

  const deps = {
    currentDay: () => state.day,
    isCurrent: (period: PeriodId, day: string) => state.day === day && state.activePeriod === period,
    readMessage: (period: PeriodId, day: string) => messages.get(key(period, day)) ?? defaultMessage(period),
    writeMessage: (message: DailyMessage, day: string) => {
      messages.set(key(message.periodId, day), message);
      calls.writes.push({ message, day });
    },
    selectImage: async (period: PeriodId, day: string, excludeImage?: string): Promise<BankSelection> => {
      calls.selectImage.push({ period, day, excludeImage });
      calls.events.push('bank');
      return {
        imageId: `bank:${calls.selectImage.length}`,
        image: `/images/daily/${period}-bank-${calls.selectImage.length}.jpg`,
        source: 'offline',
      };
    },
    selectText: async (period: PeriodId, day: string, excludeText?: string) => {
      calls.selectText.push({ period, day, excludeText });
      return `Texto selecionado ${calls.selectText.length}`;
    },
    generateAi: async (period: PeriodId) => {
      calls.generateAi.push({ period });
      calls.events.push('ai');
      return state.generateImpl(period);
    },
    prepareAi: async (image: string) => {
      calls.prepareAi.push(image);
      return state.prepareImpl(image);
    },
    saveAi: async (period: PeriodId, image: string, day: string) => {
      calls.saveAi.push({ period, image, day });
      calls.events.push('save-ai');
      return state.saveImpl(period, image, day);
    },
    pickPhoto: async () => {
      calls.pickPhoto += 1;
      return state.photo;
    },
    aiAvailable: () => state.available,
    readQuota,
    writeQuota: (quota: DailyQuota) => {
      const saved = { day: quota.day, remaining: { ...quota.remaining } };
      quotas.set(quota.day, saved);
      calls.quotaWrites.push(saved);
    },
    beforeAction: (isCurrent: () => boolean) => {
      calls.beforeAction += 1;
      calls.events.push('ad');
      return state.beforeActionImpl(isCurrent);
    },
    onBusy: (phase: string | null) => calls.busy.push(phase),
    onError: (message: string | null) => calls.errors.push(message),
  };

  return {
    state,
    calls,
    messages,
    quotas,
    deps,
    createFlow: () => createDailyContentFlow(deps),
    seedMessage(period: PeriodId, day: string, message: DailyMessage) { messages.set(key(period, day), message); },
  };
}

function seedAfterManualRefresh(harness: ReturnType<typeof createHarness>, period: PeriodId, day: string): void {
  harness.seedMessage(period, day, {
    periodId: period,
    mainText: 'Texto do cartão',
    image: `/images/daily/${period}-01.jpg`,
    source: 'offline',
    generationFlow: { day, manualBankRefreshes: 1 },
  });
}

test('the first refresh uses the bank, the second can use AI, and later refreshes return to the bank', async () => {
  const harness = createHarness();
  const firstFlow = harness.createFlow();

  assert.equal(await firstFlow.generate('morning', DAY), 'updated');
  assert.equal(harness.calls.selectImage.length, 1);
  assert.equal(harness.calls.generateAi.length, 0);
  assert.equal(firstFlow.remainingAi('morning', DAY), 1);
  assert.equal(harness.messages.get(`${DAY}:morning`)?.generationFlow?.manualBankRefreshes, 1);

  // A new flow instance reads both persisted message phase and daily allowance.
  const secondFlow = harness.createFlow();
  assert.equal(secondFlow.remainingAi('morning', DAY), 1);
  assert.equal(await secondFlow.generate('morning', DAY), 'updated');
  assert.equal(harness.calls.generateAi.length, 1);
  assert.equal(harness.calls.saveAi.length, 1);
  assert.deepEqual(harness.calls.events.slice(-3), ['ad', 'ai', 'save-ai'], 'AI work starts after the ad gate resolves');
  assert.equal(harness.calls.saveAi[0].day, DAY);
  assert.equal(secondFlow.remainingAi('morning', DAY), 0);
  assert.equal(harness.messages.get(`${DAY}:morning`)?.source, 'firebase');

  const thirdFlow = harness.createFlow();
  assert.equal(thirdFlow.remainingAi('morning', DAY), 0);
  assert.equal(await thirdFlow.generate('morning', DAY), 'updated');
  assert.equal(harness.calls.selectImage.length, 2);
  assert.equal(harness.calls.generateAi.length, 1, 'the one successful AI image consumes this period’s daily allowance');
  assert.equal(harness.quotas.get(DAY)?.remaining.morning, 0);
});

test('two taps while the ad is pending start only one action', async () => {
  const harness = createHarness();
  const ad = createDeferred<void>();
  harness.state.beforeActionImpl = () => ad.promise;
  const flow = harness.createFlow();

  const first = flow.generate('morning', DAY);
  const duplicate = await flow.generate('morning', DAY);
  assert.equal(duplicate, 'busy');
  assert.equal(harness.calls.beforeAction, 1);
  assert.equal(harness.calls.selectImage.length, 0);
  ad.resolve();
  assert.equal(await first, 'updated');
  assert.equal(harness.calls.selectImage.length, 1);
});

test('invalidation during the ad prevents both generation and opening the photo picker', async () => {
  const generateHarness = createHarness();
  const generateAd = createDeferred<void>();
  generateHarness.state.beforeActionImpl = () => generateAd.promise;
  const generateFlow = generateHarness.createFlow();
  const generation = generateFlow.generate('morning', DAY);
  generateFlow.invalidate();
  generateAd.resolve();
  assert.equal(await generation, 'cancelled');
  assert.equal(generateHarness.calls.generateAi.length, 0);
  assert.equal(generateHarness.calls.selectImage.length, 0);
  assert.equal(generateHarness.calls.writes.length, 0);

  const photoHarness = createHarness();
  const photoAd = createDeferred<void>();
  photoHarness.state.beforeActionImpl = () => photoAd.promise;
  const photoFlow = photoHarness.createFlow();
  const photoAction = photoFlow.usePersonalPhoto('morning', DAY);
  photoFlow.invalidate();
  photoAd.resolve();
  assert.equal(await photoAction, 'cancelled');
  assert.equal(photoHarness.calls.pickPhoto, 0);
  assert.equal(photoHarness.calls.writes.length, 0);
});

test('an AI request finishing after navigation is saved and charged to its request day only', async () => {
  const harness = createHarness();
  seedAfterManualRefresh(harness, 'morning', DAY);
  const generation = createDeferred<string>();
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  harness.state.generateImpl = () => {
    started();
    return generation.promise;
  };
  const flow = harness.createFlow();
  const action = flow.generate('morning', DAY);
  await didStart;

  harness.state.day = NEXT_DAY;
  harness.state.activePeriod = 'afternoon';
  harness.quotas.set(NEXT_DAY, { day: NEXT_DAY, remaining: { morning: 1, afternoon: 0, night: 1 } });
  assert.equal(flow.remainingAi('morning', NEXT_DAY), 1);
  flow.invalidate();
  generation.resolve('completed-after-navigation');

  assert.equal(await action, 'cancelled');
  assert.deepEqual(harness.calls.saveAi, [{ period: 'morning', image: 'prepared:completed-after-navigation', day: DAY }]);
  assert.equal(harness.calls.writes.length, 0, 'a stale request must not update the newly visible card');
  assert.equal(harness.calls.quotaWrites.some((quota) => quota.day === NEXT_DAY), false);
  assert.equal(flow.remainingAi('morning', DAY), 0, 'the completed request still consumes its original allowance in memory');
  assert.equal(flow.remainingAi('morning', NEXT_DAY), 1, 'the next day’s allowance remains intact');
  assert.equal(harness.quotas.get(NEXT_DAY)?.remaining.afternoon, 0);
});

test('cancelled photos leave the card, bank, and quota untouched; a picked photo changes only the card', async () => {
  const harness = createHarness();
  const flow = harness.createFlow();
  const original = flow.remainingAi('morning', DAY);

  harness.state.photo = null;
  assert.equal(await flow.usePersonalPhoto('morning', DAY), 'cancelled');
  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.selectImage.length, 0);
  assert.equal(harness.calls.saveAi.length, 0);
  assert.equal(flow.remainingAi('morning', DAY), original);

  harness.state.photo = IMAGE;
  assert.equal(await flow.usePersonalPhoto('morning', DAY), 'updated');
  assert.equal(harness.calls.writes.length, 1);
  assert.equal(harness.calls.writes[0].message.image, IMAGE);
  assert.equal(harness.calls.writes[0].message.source, 'personal');
  assert.equal(harness.calls.writes[0].message.bankImageId, undefined);
  assert.equal(harness.calls.selectImage.length, 0, 'a personal photo is not added to automatic rotation');
  assert.equal(harness.calls.saveAi.length, 0);
  assert.equal(flow.remainingAi('morning', DAY), original);
});

test('an AI generation error falls back to the bank without consuming the allowance', async () => {
  const harness = createHarness();
  seedAfterManualRefresh(harness, 'morning', DAY);
  harness.state.generateImpl = async () => { throw new Error('GENERATION_UNAVAILABLE'); };
  const flow = harness.createFlow();

  assert.equal(await flow.generate('morning', DAY), 'updated');
  assert.equal(harness.calls.generateAi.length, 1);
  assert.equal(harness.calls.saveAi.length, 0);
  assert.equal(harness.calls.selectImage.length, 1);
  assert.equal(flow.remainingAi('morning', DAY), 1);
  assert.match(harness.calls.errors.at(-1) ?? '', /indisponível/);
  assert.equal(harness.messages.get(`${DAY}:morning`)?.source, 'offline');
});

test('attestation failure preserves its actionable message and AI quota when falling back', async () => {
  const harness = createHarness();
  seedAfterManualRefresh(harness, 'morning', DAY);
  harness.state.generateImpl = async () => {
    throw Object.assign(new Error('private upstream error'), { code: 'FIREBASE_AI_APPCHECK_FAILED' });
  };
  const flow = harness.createFlow();
  assert.equal(await flow.generate('morning', DAY), 'updated');
  assert.equal(flow.remainingAi('morning', DAY), 1);
  assert.equal(harness.messages.get(`${DAY}:morning`)?.source, 'offline');
  assert.equal(harness.calls.errors.at(-1), 'Não foi possível validar a segurança do app. Tente novamente.');
});

test('Firebase billing, model, and access errors preserve their actionable messages during fallback', async () => {
  const failures = [
    {
      code: 'FIREBASE_AI_BILLING_REQUIRED',
      userMessage: 'A geração por IA exige um projeto Firebase com faturamento habilitado.',
    },
    {
      code: 'FIREBASE_AI_MODEL_UNAVAILABLE',
      userMessage: 'O modelo de imagem está indisponível no momento.',
    },
    {
      code: 'FIREBASE_AI_ACCESS_DENIED',
      userMessage: 'O Firebase não autorizou a geração. Confira as configurações do projeto.',
    },
  ];

  for (const failure of failures) {
    const harness = createHarness();
    seedAfterManualRefresh(harness, 'morning', DAY);
    harness.state.generateImpl = async () => {
      throw Object.assign(new Error('provider detail stays private'), failure);
    };
    const flow = harness.createFlow();

    assert.equal(await flow.generate('morning', DAY), 'updated');
    assert.equal(harness.calls.errors.at(-1), failure.userMessage);
    assert.equal(flow.remainingAi('morning', DAY), 1, 'failed generation keeps the allowance available');
    assert.equal(harness.messages.get(`${DAY}:morning`)?.source, 'offline');
  }
});

test('AI storage failure shows a clear warning and does not claim the image was banked', async () => {
  const harness = createHarness();
  seedAfterManualRefresh(harness, 'morning', DAY);
  harness.state.saveImpl = async () => { throw new Error('STORAGE_FULL'); };
  const flow = harness.createFlow();

  assert.equal(await flow.generate('morning', DAY), 'updated');
  const savedCard = harness.messages.get(`${DAY}:morning`)!;
  assert.equal(savedCard.image, 'prepared:generated-image');
  assert.equal(savedCard.source, 'firebase');
  assert.equal(savedCard.bankImageId, undefined);
  assert.equal(harness.calls.selectImage.length, 0);
  assert.equal(flow.remainingAi('morning', DAY), 0, 'a successfully produced AI image consumes the allowance even if saving fails');
  assert.match(harness.calls.errors.at(-1) ?? '', /não foi possível guardá-la/);
});

for (const failure of ['request', 'preparation']) {
  test(`repeated good-night ${failure} errors always replace the image with another from the bank`, async () => {
    const harness = createHarness();
    harness.state.activePeriod = 'night';
    seedAfterManualRefresh(harness, 'night', DAY);
    const reject = async () => { throw new Error('AI_IMAGE_FAILED'); };
    if (failure === 'request') harness.state.generateImpl = reject;
    else harness.state.prepareImpl = reject;
    const flow = harness.createFlow();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const previous = harness.messages.get(`${DAY}:night`)!;
      assert.equal(await flow.generate('night', DAY), 'updated');
      const current = harness.messages.get(`${DAY}:night`)!;
      assert.notEqual(current.image, previous.image);
      assert.equal(harness.calls.selectImage.at(-1)?.excludeImage, previous.bankImageId ?? previous.image);
      assert.equal(current.source, 'offline');
      assert.equal(flow.remainingAi('night', DAY), 1);
    }
    assert.equal(harness.calls.saveAi.length, 0);
  });
}
