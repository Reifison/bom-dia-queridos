import type { FirebaseApp } from 'firebase/app';
import type { GenerateContentResult, GenerativeModel } from 'firebase/ai';
import {
  getFirebaseAiAvailability as resolveFirebaseAiAvailability,
  getFirebaseEnvironment,
  readFirebaseRuntimeSettings,
  type FirebaseAiAvailability,
  type FirebaseClientPlatform,
  type FirebaseEnvironment,
  type FirebaseRuntimeSettings,
} from '../lib/firebaseConfig';
import {
  getFirebaseClientPlatform,
  initializeFirebaseAppCheck,
  isBrowserOnline,
  type FirebaseAppCheckOptions,
} from '../lib/firebaseAppCheck';
import type { PeriodId } from '../types/period';
import { ensureAbortSignalAny } from '../lib/abortSignalCompatibility';
import { getAppLocale, type AppLocale } from '../lib/locale';

export type FirebaseImageErrorCode =
  | 'FIREBASE_AI_DISABLED'
  | 'FIREBASE_AI_NOT_CONFIGURED'
  | 'FIREBASE_AI_APPCHECK_NOT_CONFIGURED'
  | 'FIREBASE_AI_INVALID_CONFIGURATION'
  | 'FIREBASE_AI_UNSUPPORTED_PLATFORM'
  | 'FIREBASE_AI_OFFLINE'
  | 'FIREBASE_AI_APPCHECK_FAILED'
  | 'FIREBASE_AI_TIMEOUT'
  | 'FIREBASE_AI_BILLING_REQUIRED'
  | 'FIREBASE_AI_QUOTA_EXCEEDED'
  | 'FIREBASE_AI_BLOCKED'
  | 'FIREBASE_AI_MODEL_UNAVAILABLE'
  | 'FIREBASE_AI_ACCESS_DENIED'
  | 'FIREBASE_AI_NETWORK_ERROR'
  | 'FIREBASE_AI_SDK_UNAVAILABLE'
  | 'FIREBASE_AI_REQUEST_FAILED'
  | 'FIREBASE_AI_INVALID_PERIOD'
  | 'FIREBASE_AI_INVALID_RESPONSE';

const USER_MESSAGES: Record<AppLocale, Record<FirebaseImageErrorCode, string>> = {
  pt: {
    FIREBASE_AI_DISABLED: 'A geração de imagens por IA está desativada neste momento.',
    FIREBASE_AI_NOT_CONFIGURED: 'A geração de imagens por IA ainda não está configurada.',
    FIREBASE_AI_APPCHECK_NOT_CONFIGURED: 'A proteção do app ainda não está configurada para esta plataforma.',
    FIREBASE_AI_INVALID_CONFIGURATION: 'A configuração do modelo de imagem é inválida.',
    FIREBASE_AI_UNSUPPORTED_PLATFORM: 'A geração de imagens por IA não está disponível nesta plataforma.',
    FIREBASE_AI_OFFLINE: 'Conecte-se à internet para gerar uma imagem.',
    FIREBASE_AI_APPCHECK_FAILED: 'Não foi possível validar a segurança do app. Tente novamente.',
    FIREBASE_AI_TIMEOUT: 'A geração da imagem demorou mais que o esperado. Tente novamente.',
    FIREBASE_AI_BILLING_REQUIRED: 'A geração por IA exige um projeto Firebase com faturamento habilitado.',
    FIREBASE_AI_QUOTA_EXCEEDED: 'O limite de gerações foi atingido. Tente novamente mais tarde.',
    FIREBASE_AI_BLOCKED: 'O pedido de imagem foi bloqueado pelos filtros de segurança. Tente outro pedido.',
    FIREBASE_AI_MODEL_UNAVAILABLE: 'O modelo de imagem está indisponível no momento.',
    FIREBASE_AI_ACCESS_DENIED: 'O Firebase não autorizou a geração. Confira as configurações do projeto.',
    FIREBASE_AI_NETWORK_ERROR: 'Não foi possível conectar ao serviço de imagens. Verifique sua conexão.',
    FIREBASE_AI_SDK_UNAVAILABLE: 'O serviço de imagens não está disponível nesta instalação do app.',
    FIREBASE_AI_REQUEST_FAILED: 'Não foi possível gerar a imagem. Tente novamente.',
    FIREBASE_AI_INVALID_PERIOD: 'O período informado para a imagem é inválido.',
    FIREBASE_AI_INVALID_RESPONSE: 'O serviço não retornou uma imagem válida. Tente novamente.',
  },
  en: {
    FIREBASE_AI_DISABLED: 'AI image creation is currently turned off.',
    FIREBASE_AI_NOT_CONFIGURED: 'AI image creation is not set up yet.',
    FIREBASE_AI_APPCHECK_NOT_CONFIGURED: 'App security is not set up for this platform yet.',
    FIREBASE_AI_INVALID_CONFIGURATION: 'The image model configuration is invalid.',
    FIREBASE_AI_UNSUPPORTED_PLATFORM: 'AI image creation is not available on this platform.',
    FIREBASE_AI_OFFLINE: 'Connect to the internet to create an image.',
    FIREBASE_AI_APPCHECK_FAILED: 'We could not verify the app’s security. Please try again.',
    FIREBASE_AI_TIMEOUT: 'Image creation took longer than expected. Please try again.',
    FIREBASE_AI_BILLING_REQUIRED: 'AI image creation requires a Firebase project with billing enabled.',
    FIREBASE_AI_QUOTA_EXCEEDED: 'The image generation limit has been reached. Please try again later.',
    FIREBASE_AI_BLOCKED: 'The image request was blocked by safety filters. Try a different request.',
    FIREBASE_AI_MODEL_UNAVAILABLE: 'The image model is currently unavailable.',
    FIREBASE_AI_ACCESS_DENIED: 'Firebase did not authorize image creation. Check the project settings.',
    FIREBASE_AI_NETWORK_ERROR: 'We could not connect to the image service. Check your connection.',
    FIREBASE_AI_SDK_UNAVAILABLE: 'The image service is not available in this app installation.',
    FIREBASE_AI_REQUEST_FAILED: 'We could not create the image. Please try again.',
    FIREBASE_AI_INVALID_PERIOD: 'The selected image period is invalid.',
    FIREBASE_AI_INVALID_RESPONSE: 'The service did not return a valid image. Please try again.',
  },
};

export class FirebaseImageGenerationError extends Error {
  readonly code: FirebaseImageErrorCode;
  readonly userMessage: string;

  constructor(code: FirebaseImageErrorCode, cause?: unknown, locale: AppLocale = getAppLocale()) {
    super(code, { cause });
    this.name = 'FirebaseImageGenerationError';
    this.code = code;
    this.userMessage = USER_MESSAGES[locale][code];
  }
}

export interface FirebaseImageServiceDependencies {
  getEnvironment?: () => FirebaseEnvironment;
  getPlatform?: () => FirebaseClientPlatform;
  isOnline?: () => boolean;
  loadFirebaseApp?: () => Promise<typeof import('firebase/app')>;
  loadFirebaseAI?: () => Promise<typeof import('firebase/ai')>;
  initializeAppCheck?: (
    app: FirebaseApp,
    options: FirebaseAppCheckOptions,
  ) => Promise<unknown>;
  timeoutMs?: number;
  getLocale?: () => AppLocale;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

const IMAGE_PROMPTS: Record<AppLocale, Record<PeriodId, string>> = {
  pt: {
    morning: 'Crie uma imagem acolhedora e fotográfica para uma mensagem de bom dia: luz dourada suave do amanhecer, flores delicadas e sensação de esperança. Composição vertical, elegante e serena. Não inclua letras, palavras, logotipos ou marcas d’água.',
    afternoon: 'Crie uma imagem acolhedora e fotográfica para uma mensagem de boa tarde: jardim iluminado pelo sol da tarde, cores quentes e sensação de tranquilidade. Composição vertical, elegante e serena. Não inclua letras, palavras, logotipos ou marcas d’água.',
    night: 'Crie uma imagem acolhedora e fotográfica para uma mensagem de boa noite: céu azul profundo com estrelas suaves, flores claras e luz morna de uma janela ao fundo. Composição vertical, elegante e serena. Não inclua letras, palavras, logotipos ou marcas d’água.',
  },
  en: {
    morning: 'Create a welcoming, photorealistic image for a good morning message: soft golden sunrise light, delicate flowers, and a hopeful feeling. Elegant, serene vertical composition. Do not include letters, words, logos, or watermarks.',
    afternoon: 'Create a welcoming, photorealistic image for a good afternoon message: a garden in warm afternoon sunlight, rich colors, and a peaceful feeling. Elegant, serene vertical composition. Do not include letters, words, logos, or watermarks.',
    night: 'Create a welcoming, photorealistic image for a good night message: a deep blue starry sky, pale flowers, and warm light from a window in the background. Elegant, serene vertical composition. Do not include letters, words, logos, or watermarks.',
  },
};

function isPeriodId(value: unknown): value is PeriodId {
  return value === 'morning' || value === 'afternoon' || value === 'night';
}

function createErrorForAvailability(reason: FirebaseAiAvailability['reason'], locale: AppLocale): FirebaseImageGenerationError {
  const codeByReason: Record<Exclude<FirebaseAiAvailability['reason'], 'ready'>, FirebaseImageErrorCode> = {
    disabled: 'FIREBASE_AI_DISABLED',
    'missing-firebase-config': 'FIREBASE_AI_NOT_CONFIGURED',
    'missing-app-check-config': 'FIREBASE_AI_APPCHECK_NOT_CONFIGURED',
    'invalid-model': 'FIREBASE_AI_INVALID_CONFIGURATION',
    'unsupported-platform': 'FIREBASE_AI_UNSUPPORTED_PLATFORM',
    offline: 'FIREBASE_AI_OFFLINE',
  };
  return new FirebaseImageGenerationError(reason === 'ready' ? 'FIREBASE_AI_REQUEST_FAILED' : codeByReason[reason], undefined, locale);
}

function errorParts(error: unknown): { code: string; message: string; status?: number } {
  if (typeof error !== 'object' || error === null) {
    return { code: '', message: typeof error === 'string' ? error : '' };
  }
  const value = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
    customErrorData?: { status?: unknown; statusText?: unknown };
    httpStatus?: unknown;
  };
  const code = typeof value.code === 'string' ? value.code : '';
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  const statusValue = value.status ?? value.customErrorData?.status ?? value.httpStatus;
  return {
    code: `${code} ${name}`.trim(),
    message: `${message} ${typeof value.customErrorData?.statusText === 'string' ? value.customErrorData.statusText : ''}`.trim(),
    ...(typeof statusValue === 'number' && Number.isFinite(statusValue) ? { status: statusValue } : {}),
  };
}

export function mapFirebaseAiError(error: unknown, locale: AppLocale = getAppLocale()): FirebaseImageGenerationError {
  if (error instanceof FirebaseImageGenerationError) return error;
  const { code, message, status } = errorParts(error);
  const text = `${code} ${message}`.toLowerCase();

  if (/app[- ]?check|attestation|re.?captcha/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_APPCHECK_FAILED', error, locale);
  }
  if (/aborterror|timeout|timed out/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_TIMEOUT', error, locale);
  }
  if (/blaze|paid tier|payment method|billing.{0,24}(?:required|disabled|must be enabled)|(?:requires?|needs?)\s+(?:a\s+)?billing/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_BILLING_REQUIRED', error, locale);
  }
  if (status === 429 || /resource[_ -]exhausted|quota exceeded|rate limit/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_QUOTA_EXCEEDED', error, locale);
  }
  if (/blocked|safety|prohibited content|prompt feedback/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_BLOCKED', error, locale);
  }
  if (/genai config not found|api[- ]not[- ]enabled/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_NOT_CONFIGURED', error, locale);
  }
  if (status === 404 || /model.*not found|model.*unavailable/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_MODEL_UNAVAILABLE', error, locale);
  }
  if (status === 403 || /permission[_ -]denied|access denied/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_ACCESS_DENIED', error, locale);
  }
  if (/failed to fetch|networkerror|network request failed/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_NETWORK_ERROR', error, locale);
  }
  if (/cannot find package|failed to resolve|module not found/.test(text)) {
    return new FirebaseImageGenerationError('FIREBASE_AI_SDK_UNAVAILABLE', error, locale);
  }
  return new FirebaseImageGenerationError('FIREBASE_AI_REQUEST_FAILED', error, locale);
}

function isBlockedResponse(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const result = response as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: Array<{ finishReason?: unknown }>;
  };
  const blockReason = result.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason !== 'BLOCK_REASON_UNSPECIFIED') return true;
  const finishReason = result.candidates?.[0]?.finishReason;
  return typeof finishReason === 'string' && /safety|block|prohibited/i.test(finishReason);
}

function inlineDataParts(response: unknown): unknown[] {
  if (typeof response !== 'object' || response === null) return [];
  const value = response as {
    inlineDataParts?: (() => unknown[] | undefined) | unknown[];
    candidates?: Array<{ content?: { parts?: unknown[] } }>;
  };
  if (typeof value.inlineDataParts === 'function') {
    try { return value.inlineDataParts() ?? []; }
    catch { return []; }
  }
  if (Array.isArray(value.inlineDataParts)) return value.inlineDataParts;
  return value.candidates?.[0]?.content?.parts ?? [];
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

export function extractFirebaseImageDataUrl(response: unknown, locale: AppLocale = getAppLocale()): string {
  if (isBlockedResponse(response)) throw new FirebaseImageGenerationError('FIREBASE_AI_BLOCKED', undefined, locale);

  for (const part of inlineDataParts(response)) {
    if (typeof part !== 'object' || part === null) continue;
    const contentPart = part as { inlineData?: unknown; thought?: unknown };
    if (contentPart.thought === true) continue;
    const inlineData = contentPart.inlineData;
    if (typeof inlineData !== 'object' || inlineData === null) continue;
    const value = inlineData as { mimeType?: unknown; data?: unknown };
    const mimeType = typeof value.mimeType === 'string' ? value.mimeType.toLowerCase() : '';
    const data = typeof value.data === 'string' ? value.data : '';
    if ((mimeType === 'image/png' || mimeType === 'image/jpeg') && isBase64(data)) {
      return `data:${mimeType};base64,${data}`;
    }
  }

  throw new FirebaseImageGenerationError('FIREBASE_AI_INVALID_RESPONSE', undefined, locale);
}

export function withFirebaseAiTimeout<T>(
  request: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  controller: AbortController,
  locale: AppLocale = getAppLocale(),
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new FirebaseImageGenerationError('FIREBASE_AI_TIMEOUT', undefined, locale));
    }, timeoutMs);
    let requestPromise: Promise<T>;
    try {
      requestPromise = typeof request === 'function' ? request() : request;
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    requestPromise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function assertNotAborted(signal: AbortSignal, locale: AppLocale = getAppLocale()): void {
  if (signal.aborted) throw new FirebaseImageGenerationError('FIREBASE_AI_TIMEOUT', undefined, locale);
}

function matchesFirebaseConfig(app: FirebaseApp, settings: FirebaseRuntimeSettings): boolean {
  const config = settings.firebaseConfig;
  return Boolean(config && app.options.projectId === config.projectId && app.options.appId === config.appId && app.options.apiKey === config.apiKey);
}

export function createFirebaseImageService(dependencies: FirebaseImageServiceDependencies = {}) {
  const environment = dependencies.getEnvironment ?? getFirebaseEnvironment;
  const platform = dependencies.getPlatform ?? getFirebaseClientPlatform;
  const online = dependencies.isOnline ?? isBrowserOnline;
  const loadFirebaseApp = dependencies.loadFirebaseApp ?? (() => import('firebase/app'));
  const loadFirebaseAI = dependencies.loadFirebaseAI ?? (() => import('firebase/ai'));
  const initializeAppCheck = dependencies.initializeAppCheck ?? initializeFirebaseAppCheck;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const currentLocale = dependencies.getLocale ?? getAppLocale;

  const availability = (): FirebaseAiAvailability => resolveFirebaseAiAvailability({
    env: environment(),
    platform: platform(),
    isOnline: online(),
  });

  async function loadModel(
    settings: FirebaseRuntimeSettings,
    clientPlatform: FirebaseClientPlatform,
    signal: AbortSignal,
    locale: AppLocale,
  ): Promise<GenerativeModel> {
    assertNotAborted(signal, locale);
    const firebaseAppModule = await loadFirebaseApp();
    assertNotAborted(signal, locale);
    const existingApp = firebaseAppModule.getApps().find((app) => app.name === '[DEFAULT]');
    const app = existingApp
      ? (matchesFirebaseConfig(existingApp, settings)
        ? existingApp
        : (() => { throw new FirebaseImageGenerationError('FIREBASE_AI_NOT_CONFIGURED', undefined, locale); })())
      : firebaseAppModule.initializeApp(settings.firebaseConfig!);

    try {
      await initializeAppCheck(app, {
        platform: clientPlatform,
        siteKey: settings.appCheckSiteKey,
      });
      assertNotAborted(signal, locale);
    } catch (error) {
      if (signal.aborted) throw new FirebaseImageGenerationError('FIREBASE_AI_TIMEOUT', error, locale);
      if (error instanceof FirebaseImageGenerationError) throw error;
      throw new FirebaseImageGenerationError('FIREBASE_AI_APPCHECK_FAILED', error, locale);
    }

    const firebaseAi = await loadFirebaseAI();
    assertNotAborted(signal, locale);
    const ai = firebaseAi.getAI(app, { backend: new firebaseAi.GoogleAIBackend() });
    const model = firebaseAi.getGenerativeModel(ai, {
      model: settings.model,
      generationConfig: { responseModalities: [firebaseAi.ResponseModality.IMAGE] },
    }, { timeout: timeoutMs });
    assertNotAborted(signal, locale);
    return model;
  }

  async function generate(period: PeriodId): Promise<string> {
    const locale = currentLocale();
    if (!isPeriodId(period)) throw new FirebaseImageGenerationError('FIREBASE_AI_INVALID_PERIOD', undefined, locale);

    const env = environment();
    const settings = readFirebaseRuntimeSettings(env);
    const clientPlatform = platform();
    const currentAvailability = resolveFirebaseAiAvailability({
      env,
      platform: clientPlatform,
      isOnline: online(),
    });
    if (!currentAvailability.available) throw createErrorForAvailability(currentAvailability.reason, locale);

    try {
      ensureAbortSignalAny();
      const controller = new AbortController();
      return await withFirebaseAiTimeout(async () => {
        const model = await loadModel(settings, clientPlatform, controller.signal, locale);
        assertNotAborted(controller.signal, locale);
        const result = await model.generateContent(IMAGE_PROMPTS[locale][period], {
          signal: controller.signal,
          timeout: timeoutMs,
        }) as GenerateContentResult;
        assertNotAborted(controller.signal, locale);
        return extractFirebaseImageDataUrl(result.response, locale);
      }, timeoutMs, controller, locale);
    } catch (error) {
      throw mapFirebaseAiError(error, locale);
    }
  }

  return { getAvailability: availability, generate };
}

const firebaseImageService = createFirebaseImageService();

export function getFirebaseAiAvailability(): FirebaseAiAvailability {
  return firebaseImageService.getAvailability();
}

export function generateFirebaseImage(period: PeriodId): Promise<string> {
  return firebaseImageService.generate(period);
}
