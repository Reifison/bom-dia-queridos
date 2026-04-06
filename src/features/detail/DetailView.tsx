import { Copy, Download, Quote, RefreshCw, Share2, X } from 'lucide-react';
import { IconCircleButton } from '../../components/ui/IconCircleButton';
import type { DailyMessage, Period } from '../../types/period';

export interface DetailViewProps {
  period: Period;
  message: DailyMessage;
  onBack: () => void;
  onShare: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  generationsRemaining: number;
}

export function DetailView({
  period,
  message,
  onBack,
  onShare,
  onGenerate,
  isGenerating,
  generationsRemaining,
}: DetailViewProps) {
  return (
    <div className="pt-12 px-6">
      <div className="flex items-center justify-between mb-6">
        <IconCircleButton onClick={onBack}>
          <X size={20} />
        </IconCircleButton>
        <span className="font-headline font-bold text-lg text-theme-primary">{period.title}</span>
        <div className="w-10 h-10" aria-hidden />
      </div>

      <div className="relative w-full aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl border border-black/5 bg-black">
        <img
          src={message.image}
          alt="Mensagem do dia"
          fetchPriority="high"
          decoding="async"
          width={480}
          height={600}
          className={`w-full h-full object-cover transition-all duration-700 ${isGenerating ? 'opacity-40 blur-md scale-105' : 'opacity-100 scale-100'}`}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black/80 pointer-events-none" />

        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
            <RefreshCw size={32} className="animate-spin mb-4 text-theme-primary-container" />
            <p className="font-headline font-bold tracking-widest text-sm uppercase">Criando nova magia...</p>
          </div>
        )}

        <div
          className={`absolute inset-0 p-6 sm:p-8 flex flex-col justify-between text-center transition-opacity duration-500 ${isGenerating ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="flex flex-col items-center mt-2">
            <p className="font-headline font-bold text-theme-primary-container text-xs tracking-widest uppercase mb-4 drop-shadow-md">
              {period.title} QUERIDOS!
            </p>
            <h2 className="font-headline text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow-lg">
              {message.mainText}
            </h2>
          </div>

          <div className="flex flex-col items-center justify-end mb-2">
            {message.quote && (
              <div className="flex flex-col items-center gap-2 opacity-90">
                <Quote className="text-white/70" size={16} />
                <p className="font-body text-sm sm:text-base italic text-white/90 drop-shadow-md line-clamp-3">
                  {message.quote}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onShare}
          className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-theme-action-share-bg text-theme-action-share-fg active:scale-95 transition-transform shadow-sm"
        >
          <div className="flex gap-2">
            <Share2 size={20} />
            <Download size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Compartilhar / Salvar</span>
        </button>

        <button
          type="button"
          onClick={onGenerate}
          disabled={generationsRemaining <= 0 || isGenerating}
          className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-transform shadow-sm ${
            generationsRemaining > 0 && !isGenerating
              ? 'bg-theme-action-generate-bg text-theme-action-generate-fg active:scale-95'
              : 'bg-theme-action-disabled-bg text-theme-action-disabled-fg'
          }`}
        >
          <RefreshCw size={20} className={isGenerating ? 'animate-spin' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-center">
            Gerar Nova ({generationsRemaining}/1 hoje)
          </span>
        </button>
      </div>

      <div className="mt-6 flex justify-center mb-8">
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-black/5 text-theme-on-surface-variant text-sm font-semibold hover:bg-black/10 transition-colors"
        >
          <Copy size={16} />
          <span>Copiar texto da mensagem</span>
        </button>
      </div>
    </div>
  );
}
