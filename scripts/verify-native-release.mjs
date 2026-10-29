import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const publicDir = process.argv[2] || 'ios/App/App/public';
const isAndroid = publicDir.includes('android/');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+src="([^"]+)"/);
if (!entry) throw new Error('Native release entry point is missing.');
const bundle = fs.readFileSync(path.join(publicDir, entry[1]), 'utf8');
if (!/VITE_ADS_TESTING\s*:\s*["']false["']/.test(bundle)) {
  throw new Error('Native assets still enable test ads. Run the platform sync:release script before packaging.');
}
if (!bundle.includes('Good Morning, Dear Ones')) {
  throw new Error('The native release bundle is missing English localization.');
}
if (isAndroid) {
  const nativeConfig = JSON.parse(fs.readFileSync(path.join(path.dirname(publicDir), 'capacitor.config.json'), 'utf8'));
  if (nativeConfig.server?.url || nativeConfig.server?.cleartext) {
    throw new Error('Android release must use bundled assets without a development server.');
  }
  const services = JSON.parse(fs.readFileSync('android/app/google-services.json', 'utf8'));
  if (!services.client?.some(client => client.client_info?.android_client_info?.package_name === nativeConfig.appId)) {
    throw new Error('Android Firebase package does not match the app ID.');
  }
  const adUnits = ['6089531040', '2150286036', '4552982896'];
  if (!adUnits.every(id => bundle.includes(`ca-app-pub-1257467824403671/${id}`))) {
    throw new Error('Android release is missing the production ad configuration.');
  }
  const strings = fs.readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  if (!strings.includes('ca-app-pub-1257467824403671~9999916542')) {
    throw new Error('Android native AdMob app ID does not match the production configuration.');
  }
} else {
  if (!bundle.includes('TrackingConsent') || !bundle.includes('ATT_DEFERRED')) {
    throw new Error('Native assets are missing the ATT gate before ads startup.');
  }
  const plistPath = path.join(path.dirname(publicDir), 'Info.plist');
  const purpose = execFileSync('/usr/bin/plutil', [
    '-extract', 'NSUserTrackingUsageDescription', 'raw', '-o', '-', plistPath,
  ], { encoding: 'utf8' }).trim();
  if (!purpose) {
    throw new Error('iOS is missing the ATT purpose string.');
  }
}
console.log('Native release verified: production ads and English/Portuguese content.');
