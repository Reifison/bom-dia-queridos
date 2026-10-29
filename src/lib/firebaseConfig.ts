import publicFirebaseConfig from '../config/firebase.public.json';

export const DEFAULT_FIREBASE_AI_MODEL = 'gemini-3.1-flash-image';

export type FirebaseClientPlatform = 'web' | 'ios' | 'android' | 'unsupported';

export interface FirebaseEnvironment {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APPCHECK_SITE_KEY?: string;
  VITE_FIREBASE_AI_MODEL?: string;
  VITE_FIREBASE_AI_ENABLED?: string;
}

export interface FirebasePublicEnvironmentConfig {
  apiKey?: string;
  projectId?: string;
  appId?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appCheckSiteKey?: string;
  aiEnabled?: boolean;
  aiModel?: string;
}

export interface FirebasePublicConfig {
  apiKey: string;
  projectId: string;
  appId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export type FirebaseAiAvailabilityReason =
  | 'disabled'
  | 'missing-firebase-config'
  | 'missing-app-check-config'
  | 'invalid-model'
  | 'unsupported-platform'
  | 'offline'
  | 'ready';

export interface FirebaseRuntimeSettings {
  enabled: boolean;
  model: string;
  modelValid: boolean;
  firebaseConfig?: FirebasePublicConfig;
  missingFirebaseFields: string[];
  appCheckSiteKey?: string;
}

export interface FirebaseAiAvailability {
  available: boolean;
  configured: boolean;
  supported: boolean;
  reason: FirebaseAiAvailabilityReason;
}

const REQUIRED_FIREBASE_FIELDS = [
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_APP_ID', 'appId'],
] as const;

const MODEL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(value: string | undefined): boolean {
  return ['true', '1'].includes(value?.trim().toLowerCase() ?? '');
}

function viteEnvironment(): FirebaseEnvironment {
  // Vite replaces this object at build time. Reading it has no network or SDK side effects.
  return ((import.meta as ImportMeta & { env?: FirebaseEnvironment }).env ?? {});
}

export function mergeFirebasePublicConfig(
  publicConfig: FirebasePublicEnvironmentConfig,
  overrides: FirebaseEnvironment,
): FirebaseEnvironment {
  return {
    VITE_FIREBASE_API_KEY: overrides.VITE_FIREBASE_API_KEY ?? publicConfig.apiKey,
    VITE_FIREBASE_PROJECT_ID: overrides.VITE_FIREBASE_PROJECT_ID ?? publicConfig.projectId,
    VITE_FIREBASE_APP_ID: overrides.VITE_FIREBASE_APP_ID ?? publicConfig.appId,
    VITE_FIREBASE_AUTH_DOMAIN: overrides.VITE_FIREBASE_AUTH_DOMAIN ?? publicConfig.authDomain,
    VITE_FIREBASE_STORAGE_BUCKET: overrides.VITE_FIREBASE_STORAGE_BUCKET ?? publicConfig.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: overrides.VITE_FIREBASE_MESSAGING_SENDER_ID ?? publicConfig.messagingSenderId,
    VITE_FIREBASE_APPCHECK_SITE_KEY: overrides.VITE_FIREBASE_APPCHECK_SITE_KEY ?? publicConfig.appCheckSiteKey,
    VITE_FIREBASE_AI_ENABLED: overrides.VITE_FIREBASE_AI_ENABLED ?? (
      publicConfig.aiEnabled === undefined ? undefined : String(publicConfig.aiEnabled)
    ),
    VITE_FIREBASE_AI_MODEL: overrides.VITE_FIREBASE_AI_MODEL ?? publicConfig.aiModel,
  };
}

export function getFirebaseEnvironment(): FirebaseEnvironment {
  return mergeFirebasePublicConfig(publicFirebaseConfig, viteEnvironment());
}

export function readFirebaseRuntimeSettings(
  env: FirebaseEnvironment = getFirebaseEnvironment(),
): FirebaseRuntimeSettings {
  const values = new Map<string, string>();
  const missingFirebaseFields: string[] = [];

  for (const [environmentName, configName] of REQUIRED_FIREBASE_FIELDS) {
    const value = clean(env[environmentName]);
    if (value) values.set(configName, value);
    else missingFirebaseFields.push(environmentName);
  }

  const firebaseConfig = missingFirebaseFields.length === 0
    ? {
        apiKey: values.get('apiKey')!,
        projectId: values.get('projectId')!,
        appId: values.get('appId')!,
        ...(clean(env.VITE_FIREBASE_AUTH_DOMAIN)
          ? { authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN) }
          : {}),
        ...(clean(env.VITE_FIREBASE_STORAGE_BUCKET)
          ? { storageBucket: clean(env.VITE_FIREBASE_STORAGE_BUCKET) }
          : {}),
        ...(clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID)
          ? { messagingSenderId: clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID) }
          : {}),
      }
    : undefined;

  const suppliedModel = clean(env.VITE_FIREBASE_AI_MODEL);
  const model = suppliedModel ?? DEFAULT_FIREBASE_AI_MODEL;

  return {
    enabled: isEnabled(env.VITE_FIREBASE_AI_ENABLED),
    model,
    modelValid: MODEL_NAME_PATTERN.test(model),
    firebaseConfig,
    missingFirebaseFields,
    appCheckSiteKey: clean(env.VITE_FIREBASE_APPCHECK_SITE_KEY),
  };
}

export function getFirebaseAiAvailability(options: {
  env?: FirebaseEnvironment;
  platform?: FirebaseClientPlatform;
  isOnline?: boolean;
} = {}): FirebaseAiAvailability {
  const settings = readFirebaseRuntimeSettings(options.env ?? getFirebaseEnvironment());
  const platform = options.platform ?? 'web';
  const supported = platform !== 'unsupported';
  const needsWebSiteKey = platform === 'web';
  const configured = Boolean(
    settings.firebaseConfig &&
    settings.modelValid &&
    (!needsWebSiteKey || settings.appCheckSiteKey),
  );

  let reason: FirebaseAiAvailabilityReason = 'ready';
  if (!settings.enabled) reason = 'disabled';
  else if (!settings.firebaseConfig) reason = 'missing-firebase-config';
  else if (needsWebSiteKey && !settings.appCheckSiteKey) reason = 'missing-app-check-config';
  else if (!settings.modelValid) reason = 'invalid-model';
  else if (!supported) reason = 'unsupported-platform';
  else if (options.isOnline === false) reason = 'offline';

  return { available: reason === 'ready', configured, supported, reason };
}

export function isFirebaseClientPlatform(value: string): value is Exclude<FirebaseClientPlatform, 'unsupported'> {
  return value === 'web' || value === 'ios' || value === 'android';
}
