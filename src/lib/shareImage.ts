/**
 * Utilities for creating the image shared from a daily message.
 *
 * The module is browser-only because it uses an HTMLCanvasElement. It does not
 * change the image shown in the UI; it creates a self-contained 4:5 artwork.
 */

export interface ShareImageOptions {
  /** Background image as a data URL or a remotely accessible URL. */
  background: string;
  /** Period heading, for example "Bom dia". */
  title: string;
  /** Main message displayed below the heading. */
  mainText: string;
  /** Optional quotation displayed below the main message. */
  quote?: string;
  /** Output width. Height is calculated from the 4:5 ratio unless provided. */
  width?: number;
  /** Optional output height. Defaults to width * 1.25. */
  height?: number;
  /** Output MIME type. JPEG is smaller; PNG preserves transparency. */
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** JPEG/WebP quality, from 0 to 1. */
  quality?: number;
  /** Label rendered subtly in the lower-left corner. */
  signature?: string;
}

export interface ShareImageResult {
  blob: Blob;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_SIGNATURE = 'App bom dia queridos';
const FONT_STACK = 'Arial, Helvetica, sans-serif';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error('SHARE_IMAGE_LOAD_FAILED'));
      }
    };

    // This is required for remote images to remain exportable by canvas.
    // Data URLs do not need it, but setting it is harmless for them.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        fail();
        return;
      }
      if (!settled) {
        settled = true;
        resolve(image);
      }
    };
    image.onerror = fail;
    image.src = source;
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.trim().split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > canvasRatio) {
    sourceWidth = image.naturalHeight * canvasRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / canvasRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: ShareImageOptions['type'],
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('SHARE_IMAGE_EXPORT_FAILED'));
      },
      type,
      quality,
    );
  });
}

/** Composes the final 4:5 artwork and returns its image Blob. */
export async function composeShareImage(
  options: ShareImageOptions,
): Promise<ShareImageResult> {
  if (typeof document === 'undefined') {
    throw new Error('SHARE_IMAGE_REQUIRES_BROWSER');
  }
  if (!options.background.trim()) {
    throw new Error('SHARE_IMAGE_BACKGROUND_REQUIRED');
  }

  const width = Math.max(320, Math.round(options.width ?? DEFAULT_WIDTH));
  const height = Math.max(400, Math.round(options.height ?? width * 1.25));
  const type = options.type ?? 'image/jpeg';
  const quality = clamp(options.quality ?? 0.92, 0, 1);
  const signature = options.signature ?? DEFAULT_SIGNATURE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('SHARE_IMAGE_CANVAS_UNAVAILABLE');

  const background = await loadImage(options.background);
  drawCover(context, background, width, height);

  const padding = width * 0.075;
  const maxTextWidth = width - padding * 2;
  const scale = width / DEFAULT_WIDTH;
  const titleSize = Math.max(26, 58 * scale);
  let bodySize = Math.max(24, 48 * scale);
  let quoteSize = Math.max(18, 30 * scale);
  const signatureSize = Math.max(16, 22 * scale);

  const gradient = context.createLinearGradient(0, height * 0.18, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.04)');
  gradient.addColorStop(0.48, 'rgba(0, 0, 0, 0.38)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.84)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.shadowColor = 'rgba(0, 0, 0, 0.28)';
  context.shadowBlur = 8 * scale;
  context.shadowOffsetY = 2 * scale;
  context.fillStyle = '#ffffff';

  context.font = `700 ${titleSize}px ${FONT_STACK}`;
  const titleLines = wrapText(context, options.title.trim(), maxTextWidth);
  const titleStart = height * 0.48;
  const titleEnd = titleStart + titleLines.length * titleSize * 1.16;
  const safeBottom = height - padding * 1.35;
  const messageStart = titleEnd + bodySize * 0.38;
  let mainLines: string[] = [];
  let quoteLines: string[] = [];

  // Keep the full message inside the artwork. The layout scales down before it
  // ever overlaps the signature, which matters for verbose generated content.
  while (true) {
    context.font = `600 ${bodySize}px ${FONT_STACK}`;
    mainLines = wrapText(context, options.mainText.trim(), maxTextWidth);
    context.font = `italic 400 ${quoteSize}px ${FONT_STACK}`;
    quoteLines = options.quote?.trim() ? wrapText(context, options.quote.trim(), maxTextWidth) : [];
    const mainEnd = messageStart + mainLines.length * bodySize * 1.22;
    const quoteEnd = quoteLines.length
      ? mainEnd + quoteSize * 0.55 + quoteLines.length * quoteSize * 1.3
      : mainEnd;
    if (quoteEnd <= safeBottom || (bodySize <= 24 && quoteSize <= 18)) break;
    bodySize = Math.max(24, bodySize * 0.92);
    quoteSize = Math.max(18, quoteSize * 0.92);
  }

  let y = titleStart;
  for (const line of titleLines) {
    context.fillText(line, padding, y);
    y += titleSize * 1.16;
  }

  context.font = `600 ${bodySize}px ${FONT_STACK}`;
  y += bodySize * 0.38;
  for (const line of mainLines) {
    if (line) context.fillText(line, padding, y);
    y += bodySize * 1.22;
  }

  if (quoteLines.length > 0) {
    context.font = `italic 400 ${quoteSize}px ${FONT_STACK}`;
    y += quoteSize * 0.55;
    for (const line of quoteLines) {
      if (line) context.fillText(line, padding, y);
      y += quoteSize * 1.3;
    }
  }

  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.font = `500 ${signatureSize}px ${FONT_STACK}`;
  context.fillStyle = 'rgba(255, 255, 255, 0.86)';
  context.fillText(signature, padding, height - padding * 0.72);

  const blob = await canvasToBlob(canvas, type, quality);
  return { blob, width, height };
}

/** Composes the final artwork and returns a share-ready File. */
export async function composeShareImageFile(
  options: ShareImageOptions,
  fileName = 'mensagem-do-dia.jpg',
): Promise<File> {
  const { blob } = await composeShareImage(options);
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
  const normalizedName = safeName.replace(/\.(jpg|jpeg|png|webp)$/i, '') || 'mensagem-do-dia';
  return new File([blob], `${normalizedName}.${extension}`, { type: blob.type });
}
