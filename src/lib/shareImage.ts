import { t } from './locale';
/**
 * Browser-only helpers for composing the self-contained 4:5 message artwork.
 * The original photo is drawn unchanged; the canvas adds only type and a local
 * contrast panel behind it.
 */

import { chooseCalmRegion, srgbLuminance, wrapBalancedText } from './messageArtLayout';

export interface ShareImageOptions {
  textPosition?: { x: number; y: number };
  /** Produce separate preview layers for moving personal-photo text. */
  editableLayers?: boolean;
  /** A bundled path, data URL, remote URL, or already loaded canvas image. */
  background: string | CanvasImageSource;
  /** Period greeting, for example "Bom dia, queridos!". */
  title: string;
  /** Main message displayed below the greeting. */
  mainText: string;
  /** Optional quotation displayed below the main message. */
  quote?: string;
  /** Output width. Height defaults to width * 1.25 for a 4:5 artwork. */
  width?: number;
  /** Optional output height. Defaults to width * 1.25. */
  height?: number;
  /** Output MIME type. JPEG is smaller; PNG preserves transparency. */
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** JPEG/WebP quality, from 0 to 1. */
  quality?: number;
  /** Small brand line rendered near the bottom of the artwork. */
  signature?: string;
}

export interface ShareImageResult {
  blob: Blob;
  width: number;
  height: number;
  layers?: {
    photo: Blob;
    overlay: Blob;
    position: { x: number; y: number };
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  };
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_SIGNATURE = t('app: Bom dia queridos.');
const IMAGE_LOAD_TIMEOUT_MS = 15_000;
const FONT_LOAD_TIMEOUT_MS = 3_000;
const TITLE_FONT = '"Be Vietnam Pro", Arial, sans-serif';
const BODY_FONT = '"Lora", Georgia, "Times New Roman", serif';
const FALLBACK_TITLE_FONT = 'Arial, Helvetica, sans-serif';
const FALLBACK_BODY_FONT = 'Georgia, "Times New Roman", serif';
const CALM_REGION_CENTERS = [0.30, 0.50, 0.69];

interface LoadedBackground {
  image: CanvasImageSource;
  width: number;
  height: number;
}

interface ArtworkFonts {
  title: string;
  body: string;
}

interface LayoutMetrics {
  titleLines: string[];
  mainLines: string[];
  quoteLines: string[];
  titleLineHeight: number;
  mainLineHeight: number;
  quoteLineHeight: number;
  titleGap: number;
  quoteGap: number;
  blockHeight: number;
}

interface TextRegionPosition {
  centerY: number;
  meanLuminance: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };
    const fail = (code = 'SHARE_IMAGE_LOAD_FAILED') => {
      if (settled) return;
      settled = true;
      cleanup();
      image.src = '';
      reject(new Error(code));
    };
    const timeout = setTimeout(() => fail('SHARE_IMAGE_LOAD_TIMEOUT'), IMAGE_LOAD_TIMEOUT_MS);

    // Preserve the same-origin request mode used by the visible photo while
    // requesting CORS only for remote images that could taint the canvas.
    const imageUrl = new URL(source, window.location.href);
    const pageUrl = new URL(window.location.href);
    if (!['data:', 'blob:'].includes(imageUrl.protocol)
      && (imageUrl.protocol !== pageUrl.protocol || imageUrl.host !== pageUrl.host)) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        fail();
        return;
      }
      if (!settled) {
        settled = true;
        cleanup();
        resolve(image);
      }
    };
    image.onerror = () => fail();
    image.src = source;
  });
}

function readDimensions(image: CanvasImageSource): { width: number; height: number } | null {
  const candidate = image as unknown as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  const width = candidate.naturalWidth || candidate.videoWidth || candidate.displayWidth || candidate.width || 0;
  const height = candidate.naturalHeight || candidate.videoHeight || candidate.displayHeight || candidate.height || 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

async function loadBackground(background: ShareImageOptions['background']): Promise<LoadedBackground> {
  if (typeof background === 'string') {
    const image = await loadImage(background);
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  }

  const dimensions = readDimensions(background);
  if (!dimensions) throw new Error('SHARE_IMAGE_BACKGROUND_INVALID');
  return { image: background, ...dimensions };
}

async function loadArtworkFonts(): Promise<ArtworkFonts> {
  const fallback = { title: FALLBACK_TITLE_FONT, body: FALLBACK_BODY_FONT };
  const fontSet = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fontSet || typeof fontSet.load !== 'function') return fallback;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), FONT_LOAD_TIMEOUT_MS);
  });
  const loading = Promise.all([
    fontSet.load('500 38px "Be Vietnam Pro"'),
    fontSet.load('500 58px "Lora"'),
    fontSet.load('400 18px "Be Vietnam Pro"'),
  ]).then((faces) => faces.every((loadedFaces) => loadedFaces.length > 0))
    .catch(() => false);

  const loaded = await Promise.race([loading, timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  return loaded ? { title: TITLE_FONT, body: BODY_FONT } : fallback;
}

function drawCover(
  context: CanvasRenderingContext2D,
  background: LoadedBackground,
  width: number,
  height: number,
): void {
  const imageRatio = background.width / background.height;
  const canvasRatio = width / height;
  let sourceWidth = background.width;
  let sourceHeight = background.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > canvasRatio) {
    sourceWidth = background.height * canvasRatio;
    sourceX = (background.width - sourceWidth) / 2;
  } else {
    sourceHeight = background.width / canvasRatio;
    sourceY = (background.height - sourceHeight) / 2;
  }

  context.drawImage(
    background.image,
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

function sampleRegion(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): { mean: number; variance: number } | null {
  try {
    const data = context.getImageData(x, y, width, height).data;
    if (data.length < 4) return null;

    const pixelCount = data.length / 4;
    const stride = Math.max(1, Math.floor(pixelCount / 500));
    let total = 0;
    let totalSquared = 0;
    let samples = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += stride) {
      const offset = pixel * 4;
      const alpha = data[offset + 3] / 255;
      const red = data[offset] * alpha + 255 * (1 - alpha);
      const green = data[offset + 1] * alpha + 255 * (1 - alpha);
      const blue = data[offset + 2] * alpha + 255 * (1 - alpha);
      const luminance = srgbLuminance(red, green, blue);
      total += luminance;
      totalSquared += luminance * luminance;
      samples += 1;
    }

    if (samples === 0) return null;
    const mean = total / samples;
    return { mean, variance: Math.max(0, totalSquared / samples - mean * mean) };
  } catch {
    // A remote image without usable CORS can still be composed with the safe
    // default position and a dark contrast panel.
    return null;
  }
}

export function assertPhotoBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  const photo = sampleRegion(context, 0, 0, width, height);
  if (photo && photo.mean > 0.98 && photo.variance < 0.0001) {
    throw new Error('SHARE_IMAGE_BACKGROUND_EMPTY');
  }
}

function drawLocalContrastGradient(
  context: CanvasRenderingContext2D,
  width: number,
  canvasHeight: number,
  panelTop: number,
  panelHeight: number,
  scale: number,
  darkPhoto: boolean,
  left = 0,
): void {
  const fade = Math.max(0, Math.min(90 * scale, panelTop, canvasHeight - panelTop - panelHeight));
  const gradientTop = panelTop - fade;
  const gradientHeight = panelHeight + fade * 2;
  const plateauStart = fade / gradientHeight;
  const plateauEnd = (fade + panelHeight) / gradientHeight;
  const transparent = darkPhoto ? 'rgba(13, 24, 39, 0)' : 'rgba(255, 250, 240, 0)';
  const plateau = darkPhoto ? 'rgba(13, 24, 39, 0.72)' : 'rgba(255, 250, 240, 0.84)';
  const gradient = context.createLinearGradient(0, gradientTop, 0, gradientTop + gradientHeight);
  gradient.addColorStop(0, transparent);
  gradient.addColorStop(plateauStart, plateau);
  gradient.addColorStop(plateauEnd, plateau);
  gradient.addColorStop(1, transparent);
  context.fillStyle = gradient;
  context.fillRect(left, gradientTop, width, gradientHeight);
}

function pickTextRegion(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  panelWidth: number,
  panelHeight: number,
  topPadding: number,
  safeBottom: number,
): TextRegionPosition {
  const minCenter = topPadding + panelHeight / 2;
  const maxCenter = safeBottom - panelHeight / 2;
  const fallbackY = clamp(height * 0.36, minCenter, Math.max(minCenter, maxCenter));
  if (typeof context.getImageData !== 'function' || maxCenter < minCenter) {
    return { centerY: fallbackY, meanLuminance: null };
  }

  const samples: Array<{ centerY: number; mean: number; variance: number }> = [];
  for (const fraction of CALM_REGION_CENTERS) {
    const centerY = height * fraction;
    if (centerY < minCenter || centerY > maxCenter) continue;
    const x = Math.max(0, Math.round((width - panelWidth) / 2));
    const y = Math.max(0, Math.round(centerY - panelHeight / 2));
    const sample = sampleRegion(context, x, y, Math.round(panelWidth), Math.round(panelHeight));
    if (sample) samples.push({ centerY, ...sample });
  }

  const selectedY = chooseCalmRegion(samples, fallbackY);
  const selected = samples.find((sample) => sample.centerY === selectedY);
  return { centerY: selectedY, meanLuminance: selected?.mean ?? null };
}

function measureLayout(
  context: CanvasRenderingContext2D,
  title: string,
  mainText: string,
  quote: string,
  maxWidth: number,
  titleSize: number,
  mainSize: number,
  quoteSize: number,
  titleFont: string,
  bodyFont: string,
): LayoutMetrics {
  context.font = `500 ${titleSize}px ${titleFont}`;
  const titleLines = wrapBalancedText(context, title, maxWidth);
  context.font = `500 ${mainSize}px ${bodyFont}`;
  const mainLines = wrapBalancedText(context, mainText, maxWidth);
  context.font = `500 ${quoteSize}px ${bodyFont}`;
  const quoteLines = wrapBalancedText(context, quote, maxWidth);

  const titleLineHeight = titleSize * 1.16;
  const mainLineHeight = mainSize * 1.24;
  const quoteLineHeight = quoteSize * 1.25;
  const titleGap = titleLines.length && mainLines.length ? Math.max(24 * (titleSize / 38), titleSize * 0.64) : 0;
  const quoteGap = quoteLines.length && mainLines.length ? mainSize * 0.34 : 0;
  const titleHeight = titleLines.length * titleLineHeight;
  const mainHeight = mainLines.length * mainLineHeight;
  const quoteHeight = quoteLines.length * quoteLineHeight;

  return {
    titleLines,
    mainLines,
    quoteLines,
    titleLineHeight,
    mainLineHeight,
    quoteLineHeight,
    titleGap,
    quoteGap,
    blockHeight: titleHeight + titleGap + mainHeight + quoteGap + quoteHeight,
  };
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

/** Composes the 4:5 artwork and returns its Blob and output dimensions. */
export async function composeShareImage(
  options: ShareImageOptions,
): Promise<ShareImageResult> {
  if (typeof document === 'undefined') {
    throw new Error('SHARE_IMAGE_REQUIRES_BROWSER');
  }
  if (typeof options.background === 'string' && !options.background.trim()) {
    throw new Error('SHARE_IMAGE_BACKGROUND_REQUIRED');
  }
  if (!options.background) throw new Error('SHARE_IMAGE_BACKGROUND_REQUIRED');

  const width = Math.max(320, Math.round(options.width ?? DEFAULT_WIDTH));
  const height = Math.max(400, Math.round(options.height ?? width * 1.25));
  const type = options.type ?? 'image/jpeg';
  const quality = clamp(options.quality ?? 0.92, 0, 1);
  const signature = options.signature ?? DEFAULT_SIGNATURE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  let context = canvas.getContext('2d');
  if (!context) throw new Error('SHARE_IMAGE_CANVAS_UNAVAILABLE');
  const photoContext = context;

  const [background, fonts] = await Promise.all([
    loadBackground(options.background),
    loadArtworkFonts(),
  ]);
  drawCover(context, background, width, height);

  // Some successful AI responses contain only white/transparent pixels. Check
  // before adding type so they cannot become apparently valid text-only cards.
  assertPhotoBackground(context, width, height);

  const scale = width / DEFAULT_WIDTH;
  const padding = width * 0.08;
  const movable = options.editableLayers || options.textPosition !== undefined;
  const maxTextWidth = Math.min(width * (movable ? 0.68 : 0.78), 842 * scale);
  const panelPaddingX = Math.max(12, 34 * scale);
  const panelPaddingY = Math.max(10, 28 * scale);
  const panelWidth = Math.min(width - padding * 2, maxTextWidth + panelPaddingX * 2);
  const titleSize = Math.max(16, 38 * scale);
  const signatureSize = Math.max(12, 18 * scale);
  const minimumMainSize = Math.max(16, 32 * scale);
  const minimumQuoteSize = Math.max(12, 18 * scale);
  const title = options.title.trim();
  const mainText = options.mainText.trim();
  const quote = options.quote?.trim() ?? '';
  let mainSize = Math.max(minimumMainSize, 58 * scale);
  let quoteSize = Math.max(minimumQuoteSize, 24 * scale);

  context.font = `400 ${signatureSize}px ${fonts.title}`;
  let actualSignatureSize = signatureSize;
  while (context.measureText(signature).width > maxTextWidth && actualSignatureSize > 10) {
    actualSignatureSize = Math.max(10, actualSignatureSize - 1);
    context.font = `400 ${actualSignatureSize}px ${fonts.title}`;
  }
  if (context.measureText(signature).width > maxTextWidth) {
    throw new Error('SHARE_IMAGE_TEXT_TOO_LONG');
  }

  const signatureTextWidth = context.measureText(signature).width;
  const signatureY = height - padding;
  const safeBottom = signatureY - actualSignatureSize * 1.25 - padding * 0.20;
  let layout: LayoutMetrics;
  let panelHeight: number;

  while (true) {
    layout = measureLayout(
      context,
      title,
      mainText,
      quote,
      maxTextWidth,
      titleSize,
      mainSize,
      quoteSize,
      fonts.title,
      fonts.body,
    );
    panelHeight = layout.blockHeight + panelPaddingY * 2;
    const fits = panelHeight <= safeBottom - padding;
    if (fits) break;

    const atMinimum = mainSize <= minimumMainSize && quoteSize <= minimumQuoteSize;
    if (atMinimum) throw new Error('SHARE_IMAGE_TEXT_TOO_LONG');
    mainSize = Math.max(minimumMainSize, mainSize - Math.max(1, 2 * scale));
    quoteSize = Math.max(minimumQuoteSize, quoteSize - Math.max(1, scale));
  }

  const topPadding = padding;
  const region = pickTextRegion(
    context,
    width,
    height,
    panelWidth,
    panelHeight,
    topPadding,
    safeBottom,
  );
  const bounds = {
    minX: (padding + panelWidth / 2) / width,
    maxX: (width - padding - panelWidth / 2) / width,
    minY: (topPadding + panelHeight / 2) / height,
    maxY: (safeBottom - panelHeight / 2) / height,
  };
  const position = {
    x: clamp(Number.isFinite(options.textPosition?.x) ? options.textPosition!.x : 0.5, bounds.minX, bounds.maxX),
    y: clamp(Number.isFinite(options.textPosition?.y) ? options.textPosition!.y : region.centerY / height, bounds.minY, bounds.maxY),
  };
  region.centerY = position.y * height;
  if (movable) {
    region.meanLuminance = sampleRegion(context, Math.round(position.x * width - panelWidth / 2),
      Math.round(region.centerY - panelHeight / 2), Math.round(panelWidth), Math.round(panelHeight))?.mean ?? null;
  }
  const panelTop = region.centerY - panelHeight / 2;
  const darkPhoto = region.meanLuminance === null || region.meanLuminance <= 0.42;
  const footerSampleWidth = Math.min(
    width - padding * 2,
    Math.ceil(signatureTextWidth + Math.max(18 * scale, actualSignatureSize * 1.8)),
  );
  const footerSampleHeight = Math.min(height, Math.max(1, Math.ceil(actualSignatureSize * 1.7)));
  const footerSampleX = clamp(Math.round((width - footerSampleWidth) / 2), 0, width - footerSampleWidth);
  const footerSampleY = clamp(Math.round(signatureY - footerSampleHeight / 2), 0, height - footerSampleHeight);
  const footerSample = sampleRegion(
    context,
    footerSampleX,
    footerSampleY,
    footerSampleWidth,
    footerSampleHeight,
  );
  const darkFooter = footerSample ? footerSample.mean <= 0.42 : darkPhoto;
  const textColor = darkPhoto ? '#fffaf0' : '#17302f';
  const accentColor = darkPhoto ? '#f3d5aa' : '#365b50';

  let overlay: HTMLCanvasElement | undefined;
  if (options.editableLayers) {
    overlay = document.createElement('canvas');
    overlay.width = width;
    overlay.height = height;
    const overlayContext = overlay.getContext('2d');
    if (!overlayContext) throw new Error('SHARE_IMAGE_CANVAS_UNAVAILABLE');
    context = overlayContext;
  }

  context.save();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  drawLocalContrastGradient(
    context,
    movable ? panelWidth : width,
    height,
    panelTop,
    panelHeight,
    scale,
    darkPhoto,
    movable ? position.x * width - panelWidth / 2 : 0,
  );

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let y = panelTop + panelPaddingY;

  context.font = `500 ${titleSize}px ${fonts.title}`;
  context.fillStyle = accentColor;
  for (const line of layout.titleLines) {
    if (line) context.fillText(line, position.x * width, y + layout.titleLineHeight / 2);
    y += layout.titleLineHeight;
  }

  y += layout.titleGap;
  context.font = `500 ${mainSize}px ${fonts.body}`;
  context.fillStyle = textColor;
  for (const line of layout.mainLines) {
    if (line) context.fillText(line, position.x * width, y + layout.mainLineHeight / 2);
    y += layout.mainLineHeight;
  }

  if (layout.quoteLines.length) {
    y += layout.quoteGap;
    context.font = `500 ${quoteSize}px ${fonts.body}`;
    context.fillStyle = darkPhoto ? 'rgba(255, 250, 240, 0.86)' : 'rgba(23, 48, 47, 0.82)';
    for (const line of layout.quoteLines) {
      if (line) context.fillText(line, position.x * width, y + layout.quoteLineHeight / 2);
      y += layout.quoteLineHeight;
    }
  }

  if (overlay) {
    context.restore();
    context = photoContext;
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
  }
  context.font = `400 ${actualSignatureSize}px ${fonts.title}`;
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1, 1.8 * scale);
  context.strokeStyle = darkFooter ? 'rgba(13, 24, 39, 0.82)' : 'rgba(255, 250, 240, 0.90)';
  context.shadowColor = darkFooter ? 'rgba(13, 24, 39, 0.82)' : 'rgba(255, 250, 240, 0.90)';
  context.shadowBlur = Math.max(2, 3 * scale);
  context.shadowOffsetY = Math.max(1, scale);
  context.strokeText(signature, width / 2, signatureY);
  context.fillStyle = darkFooter ? 'rgba(255, 250, 240, 0.94)' : 'rgba(23, 48, 47, 0.92)';
  context.fillText(signature, width / 2, signatureY);
  context.restore();

  let layers: ShareImageResult['layers'];
  if (overlay) {
    const photo = await canvasToBlob(canvas, type, quality);
    const foreground = await canvasToBlob(overlay, 'image/png', 1);
    layers = { photo, overlay: foreground, position, bounds };
    context.drawImage(overlay, 0, 0);
  }
  const blob = await canvasToBlob(canvas, type, quality);
  return { blob, width, height, layers };
}

/** Composes the artwork and returns a share-ready File. */
export async function composeShareImageFile(
  options: ShareImageOptions,
  fileName = t('mensagem-do-dia.jpg'),
): Promise<File> {
  const { blob } = await composeShareImage(options);
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
  const normalizedName = safeName.replace(/\.(jpg|jpeg|png|webp)$/i, '') || 'mensagem-do-dia';
  return new File([blob], `${normalizedName}.${extension}`, { type: blob.type });
}
