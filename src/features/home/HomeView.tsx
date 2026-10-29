import { t } from '../../lib/locale';
import { useDuoLayout } from '../../hooks/useDuoLayout';
import { ArrowRight, Lock, Sun } from 'lucide-react';
import { PERIODS } from '../../constants/content';
import type { Period } from '../../types/period';

export function HomeView({ onSelect }: { onSelect: (p: Period) => void }) {
  const layout = useDuoLayout();
  const handlePremiumClick = () => {
    alert(
      t('Esta funcionalidade é exclusiva da versão Premium! 🌟\nEm breve você poderá desbloquear todos os momentos do dia.')
    );
  };

  return (
    <div className={`home-content ${layout ? 'home-reserved' : 'space-y-8'}`}>
      <div className="home-welcome space-y-8" style={layout ? { ...layout.preview, maxHeight: `calc(100% - ${layout.preview.top}px)` } : undefined}>
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Sun className="text-theme-primary" size={28} />
          <h1 className="text-2xl font-bold tracking-tight text-theme-primary">{t("Bom dia queridos")}</h1>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-4xl font-extrabold text-theme-on-surface tracking-tight leading-tight">
          {t("Escolha um momento")}</h2>
        <p className="text-base leading-relaxed text-theme-on-surface-variant">
          {t("Mensagens prontas todos os dias, mesmo sem internet.")}</p>
      </section>

      </div>
      <div className="home-choices" style={layout ? { ...layout.commands, maxHeight: `calc(100% - ${layout.commands.top}px)` } : undefined}>
      <div className="moment-grid grid gap-6">
        {PERIODS.map((period) => (
          <button
            key={period.id}
            type="button"
            onClick={() => (period.isEnabled ? onSelect(period) : handlePremiumClick())}
            className={`moment-card group relative aspect-[4/3] rounded-3xl overflow-hidden shadow-lg text-left w-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 ${period.isEnabled ? 'active:scale-95' : ''}`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-10" />
            <img
              src={period.image}
              alt={period.title}
              loading="lazy"
              decoding="async"
              width={640}
              height={480}
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${period.isEnabled ? 'group-hover:scale-105' : 'grayscale opacity-80'}`}
            />

            {!period.isEnabled && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-15 flex flex-col items-center justify-center">
                <div className="bg-white/20 backdrop-blur-md p-4 rounded-full mb-3">
                  <Lock className="text-white" size={32} />
                </div>
                <span className="text-white font-bold tracking-widest uppercase text-sm drop-shadow-md">
                  {t("Versão Premium")}</span>
              </div>
            )}

            <div className="moment-caption absolute bottom-0 left-0 p-8 z-20">
              <span className="moment-tag inline-block px-3 py-1 mb-3 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest">
                {period.tag}
              </span>
              <h3 className="text-4xl font-extrabold text-white tracking-tight">{period.title}</h3>
              <p className="text-white/90 mt-2 font-medium">{period.subtitle}</p>
            </div>

            <div className="moment-arrow absolute top-6 right-6 z-20">
              <div
                className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center text-white ${period.isEnabled ? 'bg-white/20' : 'bg-black/20'}`}
              >
                {period.isEnabled ? <ArrowRight size={24} /> : <Lock size={20} />}
              </div>
            </div>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
