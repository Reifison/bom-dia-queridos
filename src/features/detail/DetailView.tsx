import { t } from '../../lib/locale';
import { useDuoLayout } from '../../hooks/useDuoLayout';
import { Copy, Download, ImagePlus, RefreshCw, Share2, X } from 'lucide-react';
import { IconCircleButton } from '../../components/ui/IconCircleButton';
import { MessageArtPreview, MessageArtControls } from '../../components/MessageArtPreview';
import type { ContentBusyPhase } from '../../lib/dailyContentFlow';
import type { DailyMessage, Period } from '../../types/period';

export interface DetailViewProps {
  period: Period;
  message: DailyMessage;
  onBack: () => void;
  onShare: () => Promise<void>;
  onCopyText: () => Promise<void>;
  onGenerateNext: () => Promise<void>;
  onUsePhoto: () => Promise<void>;
  busyPhase: ContentBusyPhase;
  isDayReady: boolean;
  isSharing: boolean;
  isPreparingArt: boolean;
  artPreviewUrl: string | null;
  artLayers: ArtworkPreviewLayers | null;
  onMoveText(position?: { x: number; y: number }): void;
  actionError: string | null;
  online: boolean;
  aiAvailable: boolean;
}

export function DetailView({
  period, message, onBack, onShare, onCopyText, onGenerateNext, onUsePhoto,
  busyPhase, isDayReady, isSharing, isPreparingArt, artPreviewUrl, artLayers, onMoveText, actionError, online, aiAvailable,
}: DetailViewProps) {
  const layout = useDuoLayout();
  const [editingPosition, setEditingPosition] = useState(false);
  useEffect(() => { setEditingPosition(false); }, [message.image, message.source]);
  const busy = busyPhase !== null;
  const unavailable = busy || !isDayReady || isSharing || editingPosition;
  const shareUnavailable = isSharing || isPreparingArt || editingPosition || busy;
  const generateLabel = busyPhase === 'ai'
    ? t('Criando imagem...')
    : busyPhase === 'ad' || busyPhase === 'bank' || !isDayReady
      ? t('Preparando...')
      : t('Gerar outra');
  const visibleError = actionError && /(?:\bVITE_[A-Z0-9_]+\b|\.env\b|\bfirebase\b|\bapp\s?check\b|\bgemini\b|\bgenai\b|\bapi\b|\b(?:type|reference|syntax)error\b|\bstack\s?trace\b|\bhttp\s?\d{3}\b)/i.test(actionError)
    ? t('Não foi possível preparar outra imagem agora. Sua mensagem continua disponível.') : actionError;

  return (
    <div className={`detail-layout ${layout ? 'has-reserved-panes' : ''}`}>
      <section aria-label={t("Imagem da mensagem")} className="detail-preview" style={layout?.preview}>
      <MessageArtPreview message={message} period={period.id} url={artPreviewUrl} layers={artLayers}
        showControls={false} editing={editingPosition} disabled={busy || !isDayReady || isSharing || isPreparingArt}
        onEditingChange={setEditingPosition} onMoveText={onMoveText} />

      <p className="mt-3 text-sm text-theme-on-surface-variant">{message.source === 'personal' ? t('Sua foto, sua mensagem') : t('Pronta para compartilhar')}</p>

      </section>
      <section aria-label={t("Comandos da mensagem")} className="detail-commands" style={layout?.commands}>
      <div className="detail-header flex items-center justify-between gap-3">
        <IconCircleButton onClick={onBack} label={t("Voltar ao início")} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2">
          <X size={20} />
        </IconCircleButton>
        <span className="font-headline font-bold text-lg text-theme-primary">{period.title}</span>
        <div className="w-11 h-11" aria-hidden />
      </div>


      <div className="detail-actions">
      <MessageArtControls message={message} layers={artLayers} editing={editingPosition}
        disabled={busy || !isDayReady || isSharing || isPreparingArt} onEditingChange={setEditingPosition} onMoveText={onMoveText} />

      <div className="primary-actions grid grid-cols-2 gap-4">
        <button type="button" onClick={onShare} disabled={shareUnavailable} aria-busy={isSharing || isPreparingArt}
          className="min-h-[88px] flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-theme-action-share-bg text-theme-action-share-fg active:scale-95 transition-transform shadow-sm disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2">
          <div className="flex gap-2" aria-hidden="true"><Share2 size={20} /><Download size={20} /></div>
          <span className="text-sm font-semibold text-center">{isSharing || isPreparingArt ? t('Preparando imagem...') : t('Compartilhar / Salvar')}</span>
        </button>
        <button type="button" onClick={onGenerateNext} disabled={unavailable} aria-busy={busy && busyPhase !== 'photo'}
          className="min-h-[88px] flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-theme-action-generate-bg text-theme-action-generate-fg active:scale-95 transition-transform shadow-sm disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2">
          <RefreshCw size={20} className={busy && busyPhase !== 'photo' ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="text-sm font-semibold text-center" aria-live="polite">{generateLabel}</span>
        </button>
      </div>

      <button type="button" onClick={onUsePhoto} disabled={unavailable} aria-busy={busyPhase === 'photo'}
        className="mt-4 min-h-12 w-full flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-theme-surface-lowest text-theme-primary border border-black/10 font-semibold active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2">
        <ImagePlus size={20} aria-hidden="true" />
        <span>{busyPhase === 'photo' ? t('Abrindo suas fotos...') : t('Usar minha foto')}</span>
      </button>
      <p className="mt-3 text-center text-sm leading-relaxed text-theme-on-surface-variant">{t("Suas fotos ficam neste aparelho.")}</p>

      {(!online || !aiAvailable) && (
        <p className="mt-4 text-sm leading-relaxed text-theme-on-surface-variant">{!online ? t('Sem internet, você continua usando as imagens e mensagens disponíveis.') : t('Você pode continuar criando com as imagens disponíveis.')}</p>
      )}
      {visibleError && <p role="alert" className="mt-4 text-sm leading-relaxed text-red-800">{t(visibleError)}</p>}
      {busy && <p role="status" aria-live="polite" className="sr-only">{busyPhase === 'ai' ? t('Criando uma nova imagem. Sua mensagem atual continua disponível.') : busyPhase === 'photo' ? t('Selecione uma foto ou cancele para voltar.') : t('Preparando outra mensagem.')}</p>}

      <div className="mt-5 flex justify-center mb-8">
        <button type="button" onClick={onCopyText} className="min-h-11 flex items-center gap-2 px-6 py-3 rounded-full bg-black/5 text-theme-on-surface-variant text-sm font-semibold hover:bg-black/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2">
          <Copy size={16} aria-hidden="true" /><span>{t("Copiar texto da mensagem")}</span>
        </button>
      </div>
      </div>
      </section>
    </div>
  );
}
import { useEffect, useState } from 'react';
import type { ArtworkPreviewLayers } from '../../hooks/useMessageArt';
