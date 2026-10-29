import fs from 'node:fs';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const platform = process.argv[2];
const config = JSON.parse(fs.readFileSync('src/config/firebase.public.json', 'utf8'));
const value = (name, fallback) => env[name] === undefined ? fallback : env[name];
const enabled = ['true', '1'].includes(String(value('VITE_FIREBASE_AI_ENABLED', config.aiEnabled)).trim().toLowerCase());

try {
  if (enabled) {
    const project = value('VITE_FIREBASE_PROJECT_ID', config.projectId);
    const appId = value('VITE_FIREBASE_APP_ID', config.appId);
    const key = value('VITE_FIREBASE_API_KEY', config.apiKey);
    if (!project || !appId || !key) throw new Error('Firebase AI is enabled but its public app configuration is incomplete.');
    if (platform === 'ios' && !fs.existsSync('ios/App/App/GoogleService-Info.plist')) throw new Error('Firebase AI for iOS requires GoogleService-Info.plist in the app target.');
    if (platform === 'android' && !fs.existsSync('android/app/google-services.json')) throw new Error('Firebase AI for Android requires google-services.json in the app module.');
  }
  if (env.NATIVE_RELEASE === 'true' && env.VITE_FIREBASE_APPCHECK_DEBUG === 'true') throw new Error('Release builds cannot use the Firebase App Check debug provider.');
  console.log(`Offline daily content is ready. Firebase AI: ${enabled ? 'enabled' : 'disabled'}. No legacy API origin is required.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Native configuration is invalid.');
  process.exitCode = 1;
}
