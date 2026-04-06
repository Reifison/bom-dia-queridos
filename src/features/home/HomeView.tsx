import { ArrowRight, Lock, Quote, Search, Sun } from 'lucide-react';
import { PERIODS } from '../../constants/content';
import type { Period } from '../../types/period';
import { IconCircleButton } from '../../components/ui/IconCircleButton';

export function HomeView({ onSelect }: { onSelect: (p: Period) => void }) {
  const handlePremiumClick = () => {
    alert(
      'Esta funcionalidade é exclusiva da versão Premium! 🌟\nEm breve você poderá desbloquear todos os momentos do dia.'
    );
  };

  return (
    <div className="pt-12 px-6 space-y-8">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Sun className="text-theme-primary" size={28} />
          <h1 className="text-2xl font-bold tracking-tight text-theme-primary">Bom dia queridos</h1>
        </div>
        <IconCircleButton>
          <Search size={20} />
        </IconCircleButton>
      </header>

      <section className="space-y-2">
        <p className="text-theme-on-surface-variant font-medium tracking-wide uppercase text-xs">
          Sua dose de carinho
        </p>
        <h2 className="text-4xl font-extrabold text-theme-on-surface tracking-tight leading-tight">
          Escolha um momento
        </h2>
      </section>

      <div className="grid grid-cols-1 gap-6">
        {PERIODS.map((period) => (
          <button
            key={period.id}
            type="button"
            onClick={() => (period.isEnabled ? onSelect(period) : handlePremiumClick())}
            className={`group relative aspect-[4/3] rounded-3xl overflow-hidden shadow-lg text-left w-full transition-transform ${period.isEnabled ? 'active:scale-95' : ''}`}
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
                  Versão Premium
                </span>
              </div>
            )}

            <div className="absolute bottom-0 left-0 p-8 z-20">
              <span className="inline-block px-3 py-1 mb-3 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest">
                {period.tag}
              </span>
              <h3 className="text-4xl font-extrabold text-white tracking-tight">{period.title}</h3>
              <p className="text-white/90 mt-2 font-medium">{period.subtitle}</p>
            </div>

            <div className="absolute top-6 right-6 z-20">
              <div
                className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center text-white ${period.isEnabled ? 'bg-white/20' : 'bg-black/20'}`}
              >
                {period.isEnabled ? <ArrowRight size={24} /> : <Lock size={20} />}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="p-8 rounded-3xl bg-theme-primary-container/20 border border-theme-primary-container/30 mt-8">
        <Quote className="text-theme-primary mb-4" size={24} />
        <p className="text-theme-primary font-headline font-bold text-xl leading-relaxed italic">
          &quot;Cada amanhecer é uma nova oportunidade de espalhar amor e gratidão pelo mundo.&quot;
        </p>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-[2px] w-8 bg-theme-primary/30" />
          <span className="text-theme-primary/70 font-semibold text-xs uppercase tracking-widest">
            Inspiração do Dia
          </span>
        </div>
      </div>
    </div>
  );
}
