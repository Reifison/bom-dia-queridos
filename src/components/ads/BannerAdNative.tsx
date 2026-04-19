import { useEffect } from 'react';
import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { ADMOB_BANNER_UNIT_ID, adMobUseTestingMode } from '../../constants/adMobIds';
import { ensureAdMobInitialized } from '../../services/adMobService';

/** Space for bottom tab bar (h-20) so the banner sits above it. */
const TAB_BAR_MARGIN_PX = 88;

/**
 * Native AdMob banner (single instance). Renders nothing in DOM; the SDK overlays the WebView.
 */
export function BannerAdNative() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    void (async () => {
      try {
        await ensureAdMobInitialized();
      } catch {
        return;
      }
      if (cancelled) return;
      await AdMob.showBanner({
        adId: ADMOB_BANNER_UNIT_ID,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: TAB_BAR_MARGIN_PX,
        isTesting: adMobUseTestingMode(),
      });
    })();

    return () => {
      cancelled = true;
      void AdMob.removeBanner();
    };
  }, []);

  return null;
}
