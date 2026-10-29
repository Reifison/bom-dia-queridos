export type TrackingStatus = 0 | 1 | 2 | 3;

/** A pending/failed ATT request must never release the advertising SDK. */
export async function ensureTrackingConsent(
  platform: string,
  request: () => Promise<{ status: TrackingStatus }>,
): Promise<boolean> {
  if (platform !== 'ios') return true;
  const { status } = await request();
  if (status !== 1 && status !== 2 && status !== 3) {
    throw new Error('ATT_DEFERRED');
  }
  // ATT controls tracking/IDFA access, not permission to display an ad.
  // All callers request non-personalized ads (npa: true), and UMP must still
  // authorize advertising separately. Never proceed while ATT is pending.
  return true;
}
