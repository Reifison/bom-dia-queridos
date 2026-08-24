import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type ShareDailyMessageResult =
  | 'shared'
  | 'downloaded'
  | 'copied'
  | 'cancelled';

export interface ShareDailyMessageOptions {
  fileName?: string;
  title?: string;
  dialogTitle?: string;
}

const DEFAULT_FILE_NAME = 'mensagem-do-dia.jpg';
const DEFAULT_TITLE = 'Mensagem do Dia';

/**
 * Compartilha uma mensagem com a imagem final já renderizada.
 *
 * A imagem deve ser um Blob/File (por exemplo, o resultado de canvas.toBlob()).
 * Em iOS/Android, tenta usar @capacitor/share + @capacitor/filesystem.
 * No navegador, tenta Web Share com arquivo e cai para download/cópia.
 */
export async function shareDailyMessage(
  text: string,
  image: Blob | File,
  options: ShareDailyMessageOptions = {},
): Promise<ShareDailyMessageResult> {
  if (!(image instanceof Blob)) {
    throw new TypeError('A imagem precisa ser um Blob ou File válido.');
  }

  const fileName = normalizeFileName(options.fileName ?? DEFAULT_FILE_NAME, image.type);
  const title = options.title ?? DEFAULT_TITLE;

  if (isNativeCapacitor()) {
    const nativeResult = await tryNativeShare(text, image, {
      fileName,
      title,
      dialogTitle: options.dialogTitle,
    });

    if (nativeResult) {
      return nativeResult;
    }
  }

  const webResult = await tryWebShare(text, image, fileName, title);
  if (webResult) {
    return webResult;
  }

  return downloadAndCopy(text, image, fileName);
}

function isNativeCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

async function tryNativeShare(
  text: string,
  image: Blob | File,
  options: Required<Pick<ShareDailyMessageOptions, 'fileName' | 'title'>> &
    Pick<ShareDailyMessageOptions, 'dialogTitle'>,
): Promise<ShareDailyMessageResult | null> {
  let localFile: { path: string } | null = null;

  try {
    const path = `share/${Date.now()}-${options.fileName}`;
    const data = await blobToBase64(image);
    const result = await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    localFile = { path };

    await Share.share({
      title: options.title,
      text,
      files: [result.uri],
      dialogTitle: options.dialogTitle,
    });

    return 'shared';
  } catch (error) {
    if (isShareCancellation(error)) {
      return 'cancelled';
    }

    // Missing optional plugins or a native sharing failure can still use the
    // browser-compatible fallback when the app is running in a web context.
    return null;
  } finally {
    if (localFile) {
      try {
        await Filesystem.deleteFile({
          path: localFile.path,
          directory: Directory.Cache,
        });
      } catch {
        // Temporary cache cleanup is best-effort and must not affect sharing.
      }
    }
  }
}

async function tryWebShare(
  text: string,
  image: Blob | File,
  fileName: string,
  title: string,
): Promise<ShareDailyMessageResult | null> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return null;
  }

  const file = image instanceof File
    ? new File([image], fileName, { type: image.type || 'image/jpeg' })
    : new File([image], fileName, { type: image.type || 'image/jpeg' });
  const shareData = { title, text, files: [file] };

  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return null;
  }

  try {
    await navigator.share(shareData);
    return 'shared';
  } catch (error) {
    if (isShareCancellation(error)) {
      return 'cancelled';
    }
    return null;
  }
}

async function downloadAndCopy(
  text: string,
  image: Blob | File,
  fileName: string,
): Promise<ShareDailyMessageResult> {
  const downloaded = downloadBlob(image, fileName);
  const copied = await copyTextToClipboard(text);
  if (downloaded) {
    return 'downloaded';
  }
  if (copied) {
    return 'copied';
  }
  throw new Error('Não foi possível baixar a imagem nem copiar o texto.');
}

function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return false;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** Copies text using the modern API, with a safe legacy browser fallback. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue with the legacy clipboard fallback below.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function normalizeFileName(fileName: string, mimeType = ''): string {
  const safeName = fileName.trim() || DEFAULT_FILE_NAME;
  if (/\.[a-z0-9]+$/i.test(safeName)) {
    return safeName;
  }

  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  return `${safeName}.${extension}`;
}

function isShareCancellation(error: unknown): boolean {
  return typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError';
}

export default shareDailyMessage;
