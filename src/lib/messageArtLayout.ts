/** Text layout helpers shared by the message artwork composer. */

type TextMeasurer = Pick<CanvasRenderingContext2D, 'measureText'>;

function splitLongWord(context: TextMeasurer, word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let part = '';

  for (const character of Array.from(word)) {
    const candidate = part + character;
    if (part && context.measureText(candidate).width > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }

  if (part) parts.push(part);
  if (parts.some((item) => context.measureText(item).width > maxWidth)) {
    throw new Error('SHARE_IMAGE_TEXT_TOO_LONG');
  }
  return parts;
}

function balanceParagraph(
  context: TextMeasurer,
  words: string[],
  maxWidth: number,
): string[] {
  const count = words.length;
  const costs = new Array<number>(count + 1).fill(Number.POSITIVE_INFINITY);
  const nextBreaks = new Array<number>(count).fill(count);
  costs[count] = 0;

  for (let start = count - 1; start >= 0; start -= 1) {
    let line = '';
    for (let end = start; end < count; end += 1) {
      const candidate = line ? `${line} ${words[end]}` : words[end];
      const measuredWidth = context.measureText(candidate).width;
      if (measuredWidth > maxWidth && line) break;
      if (measuredWidth > maxWidth) {
        // Oversized words are split before this function, so this is only a
        // defensive stop if the active font metrics change mid-layout.
        break;
      }

      line = candidate;
      const slack = Math.max(0, maxWidth - measuredWidth);
      const isLastLine = end === count - 1;
      const orphanPenalty = isLastLine && start > 0
        && (end === start || measuredWidth < maxWidth * 0.30)
        ? maxWidth * maxWidth * 0.30
        : 0;
      const lineCost = slack * slack + orphanPenalty;
      const totalCost = lineCost + costs[end + 1];

      if (totalCost < costs[start]) {
        costs[start] = totalCost;
        nextBreaks[start] = end + 1;
      }
    }
  }

  const lines: string[] = [];
  for (let start = 0; start < count;) {
    const end = nextBreaks[start];
    if (end <= start) throw new Error('SHARE_IMAGE_TEXT_TOO_LONG');
    lines.push(words.slice(start, end).join(' '));
    start = end;
  }
  return lines;
}

/**
 * Wraps each paragraph to the available width while balancing line lengths.
 * Words are preserved; an unusually long token is split only when necessary
 * to keep it inside the canvas.
 */
export function wrapBalancedText(
  context: TextMeasurer,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [];
  if (!(maxWidth > 0)) throw new Error('SHARE_IMAGE_TEXT_TOO_LONG');

  const paragraphs = text.trim().split(/\r?\n/);
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
      .flatMap((word) => context.measureText(word).width > maxWidth
        ? splitLongWord(context, word, maxWidth)
        : [word]);

    if (words.length === 0) {
      lines.push('');
    } else {
      lines.push(...balanceParagraph(context, words, maxWidth));
    }
  });

  return lines;
}

export interface LuminanceSample {
  centerY: number;
  mean: number;
  variance: number;
}

/** Prefers the calmest available region and the upper third when scores tie. */
export function chooseCalmRegion(samples: LuminanceSample[], fallback = 0.36): number {
  if (samples.length === 0) return fallback;
  return samples.reduce((best, sample) => sample.variance < best.variance ? sample : best).centerY;
}

/** Computes perceptual luminance for an sRGB pixel in the 0..1 range. */
export function srgbLuminance(red: number, green: number, blue: number): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}
