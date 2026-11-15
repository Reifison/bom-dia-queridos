import type { PeriodId } from '../types/period';
import { greetingMessagesForImage } from '../constants/greetingImages';
import { selectBankImage, selectBankMessage, type BankSelection } from './personalImageBank';
import { composeShareImage, type ShareImageOptions, type ShareImageResult } from './shareImage';

const isBackgroundFailure = (error: unknown) => error instanceof Error &&
  /^SHARE_IMAGE_(LOAD_FAILED|LOAD_TIMEOUT|BACKGROUND_REQUIRED|BACKGROUND_EMPTY|BACKGROUND_INVALID)$/.test(error.message);

/** Retry only background failures; never return an artwork without a photo. */
export type ArtworkReplacement = BankSelection & { mainText?: string };

export async function composeMessageArtWithRecovery(
  source: ShareImageOptions,
  period: PeriodId,
  day: string,
  dependencies: { compose: typeof composeShareImage; select: typeof selectBankImage; selectText?: typeof selectBankMessage } =
    { compose: composeShareImage, select: selectBankImage, selectText: selectBankMessage },
): Promise<ShareImageResult & { replacement?: ArtworkReplacement }> {
  let background = source.background;
  let replacement: ArtworkReplacement | undefined;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return { ...await dependencies.compose({ ...source, background, mainText: replacement?.mainText ?? source.mainText }), replacement };
    } catch (error) {
      if (!isBackgroundFailure(error) || attempt >= 3) throw error;
      replacement = await dependencies.select(period, day, {
        bundledOnly: true,
        excludeImage: replacement?.imageId ?? (typeof background === 'string' ? background : undefined),
      });
      const originalTheme = typeof source.background === 'string' && (greetingMessagesForImage(period, source.background) || source.background.startsWith('/images/greetings/celebration-'));
      const replacementTheme = greetingMessagesForImage(period, replacement.image);
      if (dependencies.selectText && (originalTheme || replacementTheme)) {
        const mainText = await dependencies.selectText(period, day, { image: replacement.image, excludeText: source.mainText });
        replacement = { ...replacement, mainText };
      }
      background = replacement.image;
    }
  }
}
