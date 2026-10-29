interface ConsentInfo {
  status: string;
  isConsentFormAvailable?: boolean;
  canRequestAds: boolean;
}

/** Regional consent must finish before the advertising SDK starts. */
export async function initializeAdConsent<T extends ConsentInfo>(dependencies: {
  requestInfo(): Promise<T>;
  showForm(): Promise<T>;
  initialize(): Promise<unknown>;
}): Promise<T> {
  let consent = await dependencies.requestInfo();
  if (consent.isConsentFormAvailable && consent.status === 'REQUIRED') {
    consent = await dependencies.showForm();
  }
  if (consent.canRequestAds) await dependencies.initialize();
  return consent;
}
