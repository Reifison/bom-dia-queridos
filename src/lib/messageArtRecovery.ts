import type { PeriodId } from '../types/period';
import { selectBankImage, type BankSelection } from './personalImageBank';
import { composeShareImage, type ShareImageOptions, type ShareImageResult } from './shareImage';

const isBackgroundFailure = (error: unknown) => error instanceof Error &&
  /^SHARE_IMAGE_(LOAD_FAILED|LOAD_TIMEOUT|BACKGROUND_REQUIRED|BACKGROUND_EMPTY|BACKGROUND_INVALID)$/.test(error.message);

/** Retry only background failures; never return an artwork without a photo. */
export async function composeMessageArtWithRecovery(
  source: ShareImageOptions,
  period: PeriodId,
  day: string,
  dependencies = { compose: composeShareImage, select: selectBankImage },
): Promise<ShareImageResult & { replacement?: BankSelection }> {
  let background = source.background;
  let replacement: BankSelection | undefined;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return { ...await dependencies.compose({ ...source, background }), replacement };
    } catch (error) {
      if (!isBackgroundFailure(error) || attempt >= 3) throw error;
      replacement = await dependencies.select(period, day, {
        excludeImage: replacement?.imageId ?? (typeof background === 'string' ? background : undefined),
      });
      background = replacement.image;
    }
  }
}
