import { t } from '../lib/locale';
/**
 * Local-only photo selection and JPEG preparation for a user's personal photo bank.
 * This service never uploads, fetches, or otherwise sends an image anywhere.
 */

import { assertPhotoBackground } from '../lib/shareImage';

const IMAGE_DECODE_TIMEOUT_MS = 15_000;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8_000;
const MAX_IMAGE_PIXELS = 12_000_000;
const PICK_MAX_WIDTH = 1200;
const PICK_MAX_HEIGHT = 1500;
const BANK_MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

export type PersonalPhotoErrorCode =
  | 'PERSONAL_PHOTO_PICK_FAILED'
  | 'PERSONAL_PHOTO_PERMISSION_DENIED'
  | 'PERSONAL_PHOTO_UNAVAILABLE'
  | 'PERSONAL_PHOTO_INVALID_IMAGE'
  | 'PERSONAL_PHOTO_UNSUPPORTED_IMAGE'
  | 'PERSONAL_PHOTO_TOO_LARGE'
  | 'PERSONAL_PHOTO_PROCESSING_FAILED'
  | 'PERSONAL_PHOTO_TIMEOUT'
  | 'PERSONAL_PHOTO_BROWSER_UNAVAILABLE';

const USER_MESSAGES: Record<PersonalPhotoErrorCode, string> = {
  PERSONAL_PHOTO_PICK_FAILED: 'Não foi possível selecionar a foto. Tente novamente.',
  PERSONAL_PHOTO_PERMISSION_DENIED: 'Não foi possível acessar as fotos. Confira a permissão do app e tente novamente.',
  PERSONAL_PHOTO_UNAVAILABLE: 'O seletor de fotos não está disponível nesta instalação do app.',
  PERSONAL_PHOTO_INVALID_IMAGE: 'Não foi possível ler esta foto. Escolha outra imagem.',
  PERSONAL_PHOTO_UNSUPPORTED_IMAGE: 'Use uma foto nos formatos JPEG, PNG ou WebP.',
  PERSONAL_PHOTO_TOO_LARGE: 'Esta foto é grande demais para ser processada. Escolha outra imagem.',
  PERSONAL_PHOTO_PROCESSING_FAILED: 'Não foi possível preparar esta foto. Tente outra imagem.',
  PERSONAL_PHOTO_TIMEOUT: 'O processamento da foto demorou demais. Tente novamente.',
  PERSONAL_PHOTO_BROWSER_UNAVAILABLE: 'O processamento de fotos não está disponível neste app.',
};

export class PersonalPhotoError extends Error {
  readonly code: PersonalPhotoErrorCode;
  readonly userMessage: string;

  constructor(code: PersonalPhotoErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = 'PersonalPhotoError';
    this.code = code;
    this.userMessage = t(USER_MESSAGES[code]);
  }
}

type CameraOptions = {
  source: unknown;
  resultType: unknown;
  quality: number;
  width: number;
  height: number;
  correctOrientation: boolean;
  webUseInput: boolean;
};

type CameraRuntime = {
  Camera: {
    getPhoto(options: CameraOptions): Promise<{ dataUrl?: unknown } | null | undefined>;
  };
  CameraSource: { Photos: unknown };
  CameraResultType: { DataUrl: unknown };
};

export interface PersonalPhotoServiceDependencies {
  /** Lazy loading keeps the native plugin out of tests and unrelated app screens. */
  loadCamera?: () => Promise<CameraRuntime>;
  /** Allows unit tests to supply browser-independent processing. */
  normalizePickedImage?: (dataUrl: string) => Promise<string>;
  /** Allows unit tests to supply browser-independent processing. */
  prepareImage?: (dataUrl: string) => Promise<string>;
}

interface ParsedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  dataUrl: string;
}

interface ImageBounds {
  width: number;
  height: number;
}

interface OutputBounds {
  maxWidth: number;
  maxHeight: number;
}

function personalPhotoError(code: PersonalPhotoErrorCode, cause?: unknown): PersonalPhotoError {
  return new PersonalPhotoError(code, cause);
}

function readErrorDetails(error: unknown): { code: string; message: string } {
  if (typeof error !== 'object' || error === null) {
    return { code: '', message: typeof error === 'string' ? error : '' };
  }

  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value.code === 'string' ? value.code : '',
    message: typeof value.message === 'string' ? value.message : '',
  };
}

function isPhotoPickerCancellation(error: unknown): boolean {
  const { code, message } = readErrorDetails(error);
  if (code.toUpperCase() === 'OS-PLUG-CAMR-0020') return true;

  // Legacy getPhoto's documented native cancellation message.
  return /^user cancel(?:l)?ed photos app$/i.test(message.trim());
}

function mapCameraError(error: unknown): PersonalPhotoError {
  if (error instanceof PersonalPhotoError) return error;
  const { code, message } = readErrorDetails(error);
  const normalizedCode = code.toUpperCase();
  const normalizedMessage = message.toLowerCase();

  if (normalizedCode === 'OS-PLUG-CAMR-0005'
    || /(?:permission|access).*(?:denied|not granted)|(?:denied|not authorized).*photos?/i.test(normalizedMessage)) {
    return personalPhotoError('PERSONAL_PHOTO_PERMISSION_DENIED', error);
  }

  if (/module not found|cannot find package|failed to resolve/.test(normalizedMessage)) {
    return personalPhotoError('PERSONAL_PHOTO_UNAVAILABLE', error);
  }

  return personalPhotoError('PERSONAL_PHOTO_PICK_FAILED', error);
}

function mimeFromDataUrlHeader(header: string): ParsedImage['mime'] {
  const mimeMatch = /^data:([^;,]+);base64$/i.exec(header.trim());
  if (!mimeMatch) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');

  const mime = mimeMatch[1].toLowerCase();
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    throw personalPhotoError('PERSONAL_PHOTO_UNSUPPORTED_IMAGE');
  }
  return mime;
}

function estimateBase64Bytes(base64: string): number {
  if (base64.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4) {
    throw personalPhotoError('PERSONAL_PHOTO_TOO_LARGE');
  }
  if (base64.length === 0 || base64.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  }

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

function decodeBase64(base64: string): Uint8Array {
  const estimatedSize = estimateBase64Bytes(base64);
  if (estimatedSize > MAX_INPUT_BYTES) throw personalPhotoError('PERSONAL_PHOTO_TOO_LARGE');

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    if (error instanceof PersonalPhotoError) throw error;
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE', error);
  }
}

function checkedDimensions(width: number, height: number): ImageBounds {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw personalPhotoError('PERSONAL_PHOTO_TOO_LARGE');
  }
  return { width, height };
}

function readJpegDimensions(bytes: Uint8Array): ImageBounds {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return checkedDimensions(width, height);
    }
    offset += segmentLength;
  }

  throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
}

function readPngDimensions(bytes: Uint8Array): ImageBounds {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)
    || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  }

  const readUint32 = (start: number) => (
    (bytes[start] * 0x1000000) + (bytes[start + 1] << 16) + (bytes[start + 2] << 8) + bytes[start + 3]
  );
  return checkedDimensions(readUint32(16), readUint32(20));
}

function readWebpDimensions(bytes: Uint8Array): ImageBounds {
  const isRiff = bytes.length >= 20
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!isRiff) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');

  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return checkedDimensions(width, height);
  }

  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = ((bytes[26] | (bytes[27] << 8)) & 0x3fff);
    const height = ((bytes[28] | (bytes[29] << 8)) & 0x3fff);
    return checkedDimensions(width, height);
  }

  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8));
    const height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
    return checkedDimensions(width, height);
  }

  throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
}

function imageDimensions(mime: ParsedImage['mime'], bytes: Uint8Array): ImageBounds {
  switch (mime) {
    case 'image/jpeg': return readJpegDimensions(bytes);
    case 'image/png': return readPngDimensions(bytes);
    case 'image/webp': return readWebpDimensions(bytes);
  }
}

function parseImageDataUrl(dataUrl: string): ParsedImage {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  }

  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
  const mime = mimeFromDataUrlHeader(dataUrl.slice(0, comma));
  const base64 = dataUrl.slice(comma + 1);
  const bytes = decodeBase64(base64);
  try {
    const signatureMime = bytes[0] === 0xff && bytes[1] === 0xd8
      ? 'image/jpeg'
      : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        ? 'image/png'
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
          && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
          ? 'image/webp'
          : null;
    if (signatureMime === null) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
    if (signatureMime !== mime) throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');

    const dimensions = imageDimensions(mime, bytes);
    return {
      mime,
      base64,
      bytes,
      ...dimensions,
      dataUrl: `data:${mime};base64,${base64}`,
    };
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

function outputDimensions(source: ImageBounds, bounds: OutputBounds): ImageBounds {
  const scale = Math.min(1, bounds.maxWidth / source.width, bounds.maxHeight / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

function createImageFromBlob(blob: Blob): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    return Promise.reject(personalPhotoError('PERSONAL_PHOTO_BROWSER_UNAVAILABLE'));
  }

  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(blob);
  } catch (error) {
    return Promise.reject(personalPhotoError('PERSONAL_PHOTO_BROWSER_UNAVAILABLE', error));
  }

  const image = new Image();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanListeners = () => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };
    const fail = (error: PersonalPhotoError) => {
      if (settled) return;
      settled = true;
      cleanListeners();
      image.src = '';
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        fail(personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE'));
        return;
      }
      try {
        checkedDimensions(image.naturalWidth, image.naturalHeight);
      } catch (error) {
        fail(error instanceof PersonalPhotoError ? error : personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE', error));
        return;
      }
      settled = true;
      cleanListeners();
      resolve({ image, objectUrl });
    };
    const timeout = setTimeout(() => fail(personalPhotoError('PERSONAL_PHOTO_TIMEOUT')), IMAGE_DECODE_TIMEOUT_MS);

    image.onload = finish;
    image.onerror = () => fail(personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE'));
    try {
      image.src = objectUrl;
      if (typeof image.decode === 'function') {
        image.decode().then(finish, (error) => {
          if (!settled) fail(personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE', error));
        });
      }
    } catch (error) {
      fail(personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE', error));
    }
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(personalPhotoError('PERSONAL_PHOTO_TIMEOUT'));
    }, IMAGE_DECODE_TIMEOUT_MS);
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!blob) {
        reject(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED'));
        return;
      }
      if (blob.type.toLowerCase() !== 'image/jpeg') {
        reject(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED'));
        return;
      }
      resolve(blob);
    };

    try {
      canvas.toBlob(finish, 'image/jpeg', JPEG_QUALITY);
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', error));
      }
    }
  });
}

async function decodeImageBitmap(blob: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; resolve(null); }, IMAGE_DECODE_TIMEOUT_MS);
    void createImageBitmap(blob).then((bitmap) => {
      if (settled) { bitmap.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(bitmap);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(personalPhotoError('PERSONAL_PHOTO_BROWSER_UNAVAILABLE'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const clean = () => {
      clearTimeout(timeout);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const fail = (error: PersonalPhotoError) => {
      if (settled) return;
      settled = true;
      clean();
      reject(error);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clean();
      try { reader.abort(); } catch { /* The reader may already have finished. */ }
      reject(personalPhotoError('PERSONAL_PHOTO_TIMEOUT'));
    }, IMAGE_DECODE_TIMEOUT_MS);

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !/^data:image\/jpeg;base64,/i.test(result)) {
        fail(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED'));
        return;
      }
      settled = true;
      clean();
      resolve(result.replace(/^data:image\/jpeg;base64,/i, 'data:image/jpeg;base64,'));
    };
    reader.onerror = () => fail(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', reader.error));
    reader.onabort = () => fail(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED'));
    try {
      reader.readAsDataURL(blob);
    } catch (error) {
      fail(personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', error));
    }
  });
}

async function renderJpeg(
  parsed: ParsedImage,
  bounds: OutputBounds,
  rejectEmpty = false,
): Promise<string> {
  let stage = 'blob';
  let decoded: { image: HTMLImageElement; objectUrl: string } | null = null;
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (typeof document === 'undefined') throw personalPhotoError('PERSONAL_PHOTO_BROWSER_UNAVAILABLE');

    const blob = new Blob([parsed.bytes], { type: parsed.mime });
    stage = 'decode';
    // Decode pixels directly for canvas. WKWebView can report an HTML image
    // loaded while drawImage still produces a blank backing surface.
    bitmap = await decodeImageBitmap(blob);
    if (!bitmap) decoded = await createImageFromBlob(blob);
    const source = bitmap ?? decoded!.image;
    const sourceBounds = bitmap
      ? checkedDimensions(bitmap.width, bitmap.height)
      : { width: decoded!.image.naturalWidth, height: decoded!.image.naturalHeight };
    stage = 'canvas';
    const output = outputDimensions(sourceBounds, bounds);
    canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, output.width, output.height);
    stage = 'background';
    if (rejectEmpty) assertPhotoBackground(context, output.width, output.height);

    stage = 'jpeg';
    const jpegBlob = await canvasToJpegBlob(canvas);
    stage = 'data-url';
    return await blobToDataUrl(jpegBlob);
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const category = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'UNKNOWN';
    globalThis.console?.warn('[image-preparation]', {
      stage, category,
      name: error instanceof Error ? error.name : typeof error,
      causeName: cause instanceof Error ? cause.name : typeof cause,
    });
    if (error instanceof PersonalPhotoError) throw error;
    throw personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', error);
  } finally {
    bitmap?.close();
    if (canvas) {
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch { /* Releasing pixels should not mask the original result. */ }
    }
    if (decoded) {
      try { decoded.image.src = ''; } catch { /* The browser may have already detached the image. */ }
      try { URL.revokeObjectURL(decoded.objectUrl); } catch { /* Ignore already-revoked object URLs. */ }
    }
    parsed.bytes.fill(0);
  }
}

async function normalizePickedImage(dataUrl: string): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  if (parsed.mime === 'image/jpeg' && parsed.width <= PICK_MAX_WIDTH && parsed.height <= PICK_MAX_HEIGHT) {
    const normalized = parsed.dataUrl;
    parsed.bytes.fill(0);
    return normalized;
  }
  return renderJpeg(parsed, { maxWidth: PICK_MAX_WIDTH, maxHeight: PICK_MAX_HEIGHT });
}

async function prepareImage(dataUrl: string): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  return renderJpeg(parsed, { maxWidth: BANK_MAX_DIMENSION, maxHeight: BANK_MAX_DIMENSION }, true);
}

async function loadCameraPlugin(): Promise<CameraRuntime> {
  const camera = await import('@capacitor/camera');
  return camera as unknown as CameraRuntime;
}

export function createPersonalPhotoService(dependencies: PersonalPhotoServiceDependencies = {}) {
  const loadCamera = dependencies.loadCamera ?? loadCameraPlugin;
  const normalize = dependencies.normalizePickedImage ?? normalizePickedImage;
  const prepare = dependencies.prepareImage ?? prepareImage;

  return {
    async pickPersonalPhoto(): Promise<string | null> {
      let result: Awaited<ReturnType<CameraRuntime['Camera']['getPhoto']>>;
      try {
        const camera = await loadCamera();
        result = await camera.Camera.getPhoto({
          source: camera.CameraSource.Photos,
          resultType: camera.CameraResultType.DataUrl,
          quality: 85,
          width: PICK_MAX_WIDTH,
          height: PICK_MAX_HEIGHT,
          correctOrientation: true,
          webUseInput: true,
        });
      } catch (error) {
        if (isPhotoPickerCancellation(error)) return null;
        throw mapCameraError(error);
      }

      if (typeof result?.dataUrl !== 'string' || !result.dataUrl) {
        throw personalPhotoError('PERSONAL_PHOTO_INVALID_IMAGE');
      }

      try {
        return await normalize(result.dataUrl);
      } catch (error) {
        if (error instanceof PersonalPhotoError) throw error;
        throw personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', error);
      }
    },

    async prepareImageForBank(dataUrl: string): Promise<string> {
      try {
        return await prepare(dataUrl);
      } catch (error) {
        if (error instanceof PersonalPhotoError) throw error;
        throw personalPhotoError('PERSONAL_PHOTO_PROCESSING_FAILED', error);
      }
    },
  };
}

const defaultPersonalPhotoService = createPersonalPhotoService();

export async function pickPersonalPhoto(): Promise<string | null> {
  return defaultPersonalPhotoService.pickPersonalPhoto();
}

export async function prepareImageForBank(dataUrl: string): Promise<string> {
  return defaultPersonalPhotoService.prepareImageForBank(dataUrl);
}
