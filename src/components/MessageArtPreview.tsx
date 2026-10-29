import { t } from '../lib/locale';
import { messageGreeting } from '../lib/messageGreeting';
import type { DailyMessage, PeriodId } from '../types/period';

interface MessageArtPreviewProps {
  message: DailyMessage;
  period: PeriodId;
  url: string | null;
  layers: ArtworkPreviewLayers | null;
  editing: boolean;
  disabled: boolean;
  onEditingChange(editing: boolean): void;
  onMoveText(position?: { x: number; y: number }): void;
  showControls?: boolean;
}

export function MessageArtPreview({ message, period, url, layers, editing, disabled, onEditingChange, onMoveText, showControls = true }: MessageArtPreviewProps) {
  const greeting = messageGreeting(period);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; start: { x: number; y: number }; position: { x: number; y: number } } | null>(null);
  const clampPosition = (position: { x: number; y: number }) => layers ? {
    x: Math.min(layers.bounds.maxX, Math.max(layers.bounds.minX, position.x)),
    y: Math.min(layers.bounds.maxY, Math.max(layers.bounds.minY, position.y)),
  } : position;
  const movable = editing && !disabled && !!layers;
  const position = draft ?? layers?.position;
  const transform = layers && position ? `translate(${(position.x - layers.position.x) * 100}%, ${(position.y - layers.position.y) * 100}%)` : undefined;
  return (
    <>
    <div role="group" aria-label={editing ? t('Mover texto e faixa na foto') : t('Prévia da mensagem para compartilhar')}
      tabIndex={movable ? 0 : undefined} aria-describedby={message.source === 'personal' ? 'photo-position-help' : undefined}
      className="message-art relative w-full aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl bg-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-primary"
      style={{ touchAction: movable ? 'none' : 'auto', cursor: movable ? (draft ? 'grabbing' : 'grab') : undefined }}
      onPointerDown={(event) => {
        if (!movable || !layers || drag.current || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: layers.position, position: layers.position };
        setDraft(layers.position);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!movable || !active || active.pointer !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        active.position = clampPosition({ x: active.start.x + (event.clientX - active.x) / rect.width, y: active.start.y + (event.clientY - active.y) / rect.height });
        setDraft(active.position);
      }}
      onPointerUp={(event) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        drag.current = null;
        setDraft(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
        onMoveText(active.position);
      }}
      onPointerCancel={() => { drag.current = null; setDraft(null); }}
      onLostPointerCapture={() => { drag.current = null; setDraft(null); }}
      onKeyDown={(event) => {
        if (!movable || !layers) return;
        const steps: Record<string, { x: number; y: number }> = { ArrowUp: { x: 0, y: -0.02 }, ArrowDown: { x: 0, y: 0.02 }, ArrowLeft: { x: -0.02, y: 0 }, ArrowRight: { x: 0.02, y: 0 } };
        const step = steps[event.key];
        if (!step) return;
        event.preventDefault();
        onMoveText(clampPosition({ x: layers.position.x + step.x, y: layers.position.y + step.y }));
      }}>
      <img src={draft && layers ? layers.photo : url ?? message.image} alt="" aria-hidden="true" draggable={false} fetchPriority="high" decoding="async" width={1080} height={1350} className="w-full h-full object-cover pointer-events-none select-none" />
      {draft && layers && <img src={layers.overlay} alt="" aria-hidden="true" draggable={false} width={1080} height={1350} className="absolute inset-0 w-full h-full pointer-events-none select-none" style={{ transform }} />}
      {url ? (
        <div className="sr-only"><p>{greeting}</p><h2>{message.mainText}</h2>{message.quote && <p>{message.quote}</p>}</div>
      ) : (
        <div className="absolute inset-0 flex items-start justify-center pt-[28%] px-8 text-center bg-gradient-to-b from-black/25 via-black/55 to-black/10">
          <div className="text-[#fffaf0]">
            <p className="font-body text-sm font-medium mb-4">{greeting}</p>
            <h2 className="font-medium text-xl leading-snug" style={{ fontFamily: 'Lora, Georgia, serif' }}>{message.mainText}</h2>
            {message.quote && <p className="mt-4 font-body text-sm">{message.quote}</p>}
          </div>
        </div>
      )}
    </div>
    {showControls && <MessageArtControls message={message} layers={layers} editing={editing} disabled={disabled} onEditingChange={onEditingChange} onMoveText={onMoveText} />}

    </>
  );
}
import { useRef, useState } from 'react';
import { Check, Move, RotateCcw } from 'lucide-react';
import type { ArtworkPreviewLayers } from '../hooks/useMessageArt';

export function MessageArtControls({ message, layers, editing, disabled, onEditingChange, onMoveText }: Pick<MessageArtPreviewProps, 'message' | 'layers' | 'editing' | 'disabled' | 'onEditingChange' | 'onMoveText'>) {
  return (<>
    {message.source === 'personal' && (
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={disabled || !layers} onClick={() => onEditingChange(!editing)} aria-pressed={editing}
            className="min-h-11 inline-flex items-center gap-2 rounded-full px-4 py-2 bg-black/5 text-theme-primary text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-theme-primary">
            {editing ? <Check size={18} aria-hidden /> : <Move size={18} aria-hidden />}{editing ? t('Concluir ajuste') : t('Mover texto')}
          </button>
          {message.textPosition && <button type="button" disabled={disabled} onClick={() => onMoveText(undefined)} className="min-h-11 inline-flex items-center gap-2 px-2 py-2 text-sm text-theme-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-theme-primary">
            <RotateCcw size={16} aria-hidden />{t("Automático")}</button>}
        </div>
        <p id="photo-position-help" className="mt-2 text-sm leading-relaxed text-theme-on-surface-variant">{editing ? t('Arraste na foto para mover o texto e a faixa juntos. No teclado, use as setas.') : t('Posicione a mensagem sem cobrir os detalhes da sua foto.')}</p>
      </div>
    )}
  </>);
}
