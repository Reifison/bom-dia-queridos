import { t } from '../lib/locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ShareImageOptions, type ShareImageResult } from '../lib/shareImage';
import { composeMessageArtWithRecovery } from '../lib/messageArtRecovery';
import { getTodayLocal } from '../lib/periodDayCache';
import type { BankSelection } from '../lib/personalImageBank';
import { messageGreeting } from '../lib/messageGreeting';
import type { DailyMessage, PeriodId } from '../types/period';

interface RenderedArt {
  source: ShareImageOptions;
  url: string | null;
  blob: Blob | null;
  failed: boolean;
  layers: ArtworkPreviewLayers | null;
}

export interface ArtworkPreviewLayers {
  photo: string;
  overlay: string;
  position: { x: number; y: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Preview and sharing consume the very same rendered JPEG, including fonts and crop. */
export function useMessageArt(message: DailyMessage | null, period?: PeriodId, onRecovered?: (original: DailyMessage, replacement: BankSelection, day: string) => void) {
  const source = useMemo<ShareImageOptions | null>(() => message && period ? {
    background: message.image,
    title: messageGreeting(period),
    mainText: message.mainText,
    quote: message.quote,
    signature: t('app: Bom dia queridos.'),
    textPosition: message.source === 'personal' ? message.textPosition : undefined,
    editableLayers: message.source === 'personal',
  } : null, [period, message?.image, message?.mainText, message?.quote, message?.source, message?.textPosition?.x, message?.textPosition?.y]);
  const currentSource = useRef(source);
  currentSource.current = source;
  const currentMessage = useRef(message);
  currentMessage.current = message;
  const mounted = useRef(false);
  const objectUrls = useRef<string[]>([]);
  const request = useRef<{ source: ShareImageOptions; promise: Promise<ShareImageResult> } | null>(null);
  const [rendered, setRendered] = useState<RenderedArt | null>(null);

  const ensureArt = useCallback((): Promise<ShareImageResult> => {
    const original = currentMessage.current;
    if (!source || !period || !original) return Promise.reject(new Error('MESSAGE_ART_UNAVAILABLE'));
    if (request.current?.source === source) return request.current.promise;
    const requestDay = getTodayLocal();
    const promise = composeMessageArtWithRecovery(source, period, requestDay).then((result) => {
      if (mounted.current && currentSource.current === source) {
        objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
        const url = URL.createObjectURL(result.blob);
        const layers = result.layers ? {
          ...result.layers,
          photo: URL.createObjectURL(result.layers.photo),
          overlay: URL.createObjectURL(result.layers.overlay),
        } : null;
        objectUrls.current = [url, ...(layers ? [layers.photo, layers.overlay] : [])];
        setRendered({ source, url, blob: result.blob, failed: false, layers });
        if (result.replacement) onRecovered?.(original, result.replacement, requestDay);
      }
      return result;
    }).catch((error) => {
      if (request.current?.source === source) request.current = null;
      if (mounted.current && currentSource.current === source) {
        setRendered({ source, url: null, blob: null, failed: true, layers: null });
      }
      throw error;
    });
    request.current = { source, promise };
    return promise;
  }, [source, period, onRecovered]);

  useEffect(() => {
    mounted.current = true;
    if (source) void ensureArt().catch(() => { /* Sharing can retry the same composition. */ });
    return () => {
      mounted.current = false;
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    };
  }, [source, ensureArt]);

  const current = rendered?.source === source ? rendered : null;
  return {
    url: current?.url ?? null,
    isPreparing: source !== null && current === null,
    failed: current?.failed ?? false,
    layers: current?.layers ?? null,
    ensureBlob: async () => (await ensureArt()).blob,
  };
}
