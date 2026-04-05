import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { generateDailyMessage, generateDailyImage } from './services/geminiService';
import { 
  Sun, 
  Search, 
  ArrowRight, 
  Share2, 
  Download, 
  RefreshCw, 
  Home, 
  Bookmark, 
  Settings, 
  X, 
  Quote,
  Copy,
  Lock
} from 'lucide-react';

// --- Feature Flags ---
// Altere para 'false' para simular o bloqueio (Versão Premium)
const FEATURE_FLAGS = {
  ENABLE_MORNING: true,
  ENABLE_AFTERNOON: false, // Exemplo: bloqueado na versão grátis
  ENABLE_NIGHT: false,     // Exemplo: bloqueado na versão grátis
};

// --- Types & Mock Data ---

type PeriodId = 'morning' | 'afternoon' | 'night';

interface Period {
  id: PeriodId;
  title: string;
  subtitle: string;
  tag: string;
  image: string;
  isEnabled: boolean;
}

interface DailyMessage {
  periodId: PeriodId;
  mainText: string;
  quote?: string;
  image: string;
}

const PERIODS: Period[] = [
  {
    id: 'morning',
    title: 'BOM DIA',
    subtitle: 'Comece o dia com luz e gratidão.',
    tag: 'Manhã Radiante',
    image: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=1000&auto=format&fit=crop',
    isEnabled: FEATURE_FLAGS.ENABLE_MORNING
  },
  {
    id: 'afternoon',
    title: 'BOA TARDE',
    subtitle: 'Um momento de pausa e calor no coração.',
    tag: 'Tarde Acolhedora',
    image: 'https://images.unsplash.com/photo-1495584816685-4bdbf1b5057e?q=80&w=1000&auto=format&fit=crop',
    isEnabled: FEATURE_FLAGS.ENABLE_AFTERNOON
  },
  {
    id: 'night',
    title: 'BOA NOITE',
    subtitle: 'Descanse sob a paz das estrelas.',
    tag: 'Noite Serena',
    image: 'https://images.unsplash.com/photo-1532767153582-b1a0e5145009?q=80&w=1000&auto=format&fit=crop',
    isEnabled: FEATURE_FLAGS.ENABLE_NIGHT
  }
];

const INITIAL_MESSAGES: Record<PeriodId, DailyMessage> = {
  morning: {
    periodId: 'morning',
    mainText: 'Que o seu dia seja repleto de amor e esperança.',
    quote: "('O amor é a força mais poderosa do universo.' – Filme Uma Prova de Amor)",
    image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?q=80&w=1000&auto=format&fit=crop'
  },
  afternoon: {
    periodId: 'afternoon',
    mainText: 'Aproveite a tarde para respirar e recarregar as energias.',
    image: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=1000&auto=format&fit=crop'
  },
  night: {
    periodId: 'night',
    mainText: 'Deixe as preocupações de lado e tenha um sono tranquilo.',
    quote: "('A felicidade pode ser encontrada mesmo nas horas mais sombrias, se a pessoa se lembrar de acender a luz.' – Harry Potter)",
    image: 'https://images.unsplash.com/photo-1534361960057-19889db9621e?q=80&w=1000&auto=format&fit=crop'
  }
};

// --- Components ---

function InterstitialAdMock({ onClose }: { onClose: () => void }) {
  const [timeLeft, setTimeLeft] = useState(3);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white">
      <div className="absolute top-12 right-6">
        {timeLeft > 0 ? (
          <div className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold">
            Anúncio em {timeLeft}s
          </div>
        ) : (
          <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>
      <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-blue-900/50">
        <span className="font-bold text-3xl">Ad</span>
      </div>
      <p className="text-blue-400 text-xs uppercase tracking-widest mb-2 font-bold">AdMob Interstitial</p>
      <h2 className="text-2xl font-bold mb-4 text-center">Anúncio de Tela Cheia</h2>
      <p className="text-center text-gray-400 max-w-xs text-sm leading-relaxed">
        Este é um placeholder. Aqui o SDK do AdMob exibirá o anúncio em vídeo ou tela cheia antes de liberar o acesso à mensagem.
      </p>
    </div>
  );
}

function AdBannerPlaceholder({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className="w-full px-4 py-2 bg-theme-surface z-40">
      <div className="w-full h-[72px] bg-white rounded-xl shadow-sm border border-gray-100 flex items-center px-4 gap-3 relative overflow-hidden">
        {/* Ad Badge */}
        <div className="absolute top-0 left-0 bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-br">
          Ad
        </div>
        
        {/* App Icon Placeholder */}
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shrink-0">
          <div className="w-6 h-6 border-2 border-gray-300 border-dashed rounded-sm"></div>
        </div>
        
        {/* Ad Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 truncate">Sponsor App Name</h4>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="text-yellow-400">★</span>
            <span>4.8</span>
            <span className="mx-1">•</span>
            <span>GRÁTIS</span>
          </div>
        </div>
        
        {/* CTA Button */}
        <button className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-full hover:bg-blue-700 transition-colors shrink-0">
          Obter
        </button>
      </div>
    </div>
  );
}

// --- Main App Component ---

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'detail'>('home');
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [currentMessage, setCurrentMessage] = useState<DailyMessage | null>(null);
  
  const [generationsRemaining, setGenerationsRemaining] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  // --- AdMob Interstitial State ---
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState<Period | null>(null);

  const handleSelectPeriod = (period: Period) => {
    // Prepara a chamada do AdMob Tela Cheia (Interstitial)
    // TODO: Substituir pela chamada real do SDK (ex: interstitialAd.show())
    setPendingPeriod(period);
    setShowInterstitial(true);
  };

  const proceedToDetail = () => {
    setShowInterstitial(false);
    if (pendingPeriod) {
      setSelectedPeriod(pendingPeriod);
      setCurrentMessage(INITIAL_MESSAGES[pendingPeriod.id]);
      setCurrentView('detail');
      setPendingPeriod(null);
    }
  };

  const handleBack = () => {
    setCurrentView('home');
    setTimeout(() => {
      setSelectedPeriod(null);
      setCurrentMessage(null);
    }, 300);
  };

  const handleGenerateNew = async () => {
    if (generationsRemaining <= 0 || !selectedPeriod) return;
    
    setIsGenerating(true);
    
    try {
      // Chama as APIs do Gemini em paralelo para ser mais rápido
      const [newTextData, newImageUrl] = await Promise.all([
        generateDailyMessage(selectedPeriod.id),
        generateDailyImage(selectedPeriod.id)
      ]);

      setCurrentMessage({
        periodId: selectedPeriod.id,
        mainText: newTextData.mainText,
        quote: newTextData.quote,
        image: newImageUrl
      });
      
      setGenerationsRemaining(prev => prev - 1);
    } catch (error) {
      console.error("Falha ao gerar nova mensagem:", error);
      alert("Ops! Tivemos um problema ao gerar a mensagem. Verifique se a chave da API do Gemini está configurada corretamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!currentMessage || !selectedPeriod) return;
    
    const text = `${selectedPeriod.title} queridos! ✨\n\n${currentMessage.mainText}${currentMessage.quote ? `\n\n${currentMessage.quote}` : ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mensagem do Dia',
          text: text,
        });
      } catch (err) {
        console.log('Erro ao compartilhar', err);
      }
    } else {
      navigator.clipboard.writeText(text);
      alert('Texto copiado para a área de transferência!');
    }
  };

  return (
    <div className="min-h-screen bg-theme-surface flex justify-center overflow-hidden">
      {/* Mobile Container */}
      <div className="w-full max-w-md bg-theme-surface relative flex flex-col shadow-2xl overflow-hidden">
        
        {/* Interstitial Ad Overlay */}
        <AnimatePresence>
          {showInterstitial && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="absolute inset-0 z-[100]"
            >
              <InterstitialAdMock onClose={proceedToDetail} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Ad Banner */}
        <AdBannerPlaceholder position="top" />

        <AnimatePresence mode="wait">
          {currentView === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 overflow-y-auto pb-40" // Increased padding for bottom ad + nav
            >
              <HomeView onSelect={handleSelectPeriod} />
            </motion.div>
          ) : (
            <motion.div 
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 overflow-y-auto pb-40 bg-theme-surface" // Increased padding for bottom ad + nav
            >
              {selectedPeriod && currentMessage && (
                <DetailView 
                  period={selectedPeriod} 
                  message={currentMessage} 
                  onBack={handleBack}
                  onShare={handleShare}
                  onGenerate={handleGenerateNew}
                  isGenerating={isGenerating}
                  generationsRemaining={generationsRemaining}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Fixed Area (Ad + Nav) */}
        <div className="absolute bottom-0 left-0 w-full z-50 flex flex-col">
          {/* Bottom Ad Banner */}
          <AdBannerPlaceholder position="bottom" />
          
          {/* Bottom Navigation Bar */}
          <div className="w-full h-20 flex justify-around items-center px-8 pb-2 bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
            <button className="flex flex-col items-center justify-center bg-theme-primary-container/20 text-theme-primary rounded-full px-6 py-1.5 transition-all duration-300 scale-105">
              <Home size={22} className="fill-current" />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Início</span>
            </button>
            <button className="flex flex-col items-center justify-center text-theme-on-surface/40 px-6 py-1.5 hover:text-theme-primary transition-colors">
              <Bookmark size={22} />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Salvos</span>
            </button>
            <button className="flex flex-col items-center justify-center text-theme-on-surface/40 px-6 py-1.5 hover:text-theme-primary transition-colors">
              <Settings size={22} />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Ajustes</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// --- Home View ---

function HomeView({ onSelect }: { onSelect: (p: Period) => void }) {
  const handlePremiumClick = () => {
    alert('Esta funcionalidade é exclusiva da versão Premium! 🌟\nEm breve você poderá desbloquear todos os momentos do dia.');
  };

  return (
    <div className="pt-12 px-6 space-y-8">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Sun className="text-theme-primary" size={28} />
          <h1 className="text-2xl font-bold tracking-tight text-theme-primary">Bom dia queridos</h1>
        </div>
        <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-theme-primary">
          <Search size={20} />
        </button>
      </header>

      {/* Title Section */}
      <section className="space-y-2">
        <p className="text-theme-on-surface-variant font-medium tracking-wide uppercase text-xs">
          Sua dose de carinho
        </p>
        <h2 className="text-4xl font-extrabold text-theme-on-surface tracking-tight leading-tight">
          Escolha um momento
        </h2>
      </section>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6">
        {PERIODS.map((period) => (
          <button 
            key={period.id}
            onClick={() => period.isEnabled ? onSelect(period) : handlePremiumClick()}
            className={`group relative aspect-[4/3] rounded-3xl overflow-hidden shadow-lg text-left w-full transition-transform ${period.isEnabled ? 'active:scale-95' : ''}`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-10"></div>
            <img 
              src={period.image} 
              alt={period.title} 
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${period.isEnabled ? 'group-hover:scale-105' : 'grayscale opacity-80'}`}
            />
            
            {/* Premium Lock Overlay */}
            {!period.isEnabled && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-15 flex flex-col items-center justify-center">
                <div className="bg-white/20 backdrop-blur-md p-4 rounded-full mb-3">
                  <Lock className="text-white" size={32} />
                </div>
                <span className="text-white font-bold tracking-widest uppercase text-sm drop-shadow-md">Versão Premium</span>
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
              <div className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center text-white ${period.isEnabled ? 'bg-white/20' : 'bg-black/20'}`}>
                {period.isEnabled ? <ArrowRight size={24} /> : <Lock size={20} />}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Daily Inspiration */}
      <div className="p-8 rounded-3xl bg-theme-primary-container/20 border border-theme-primary-container/30 mt-8">
        <Quote className="text-theme-primary mb-4" size={24} />
        <p className="text-theme-primary font-headline font-bold text-xl leading-relaxed italic">
          "Cada amanhecer é uma nova oportunidade de espalhar amor e gratidão pelo mundo."
        </p>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-[2px] w-8 bg-theme-primary/30"></div>
          <span className="text-theme-primary/70 font-semibold text-xs uppercase tracking-widest">Inspiração do Dia</span>
        </div>
      </div>
    </div>
  );
}

// --- Detail View ---

interface DetailViewProps {
  period: Period;
  message: DailyMessage;
  onBack: () => void;
  onShare: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  generationsRemaining: number;
}

function DetailView({ period, message, onBack, onShare, onGenerate, isGenerating, generationsRemaining }: DetailViewProps) {
  return (
    <div className="pt-12 px-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-theme-primary"
        >
          <X size={20} />
        </button>
        <span className="font-headline font-bold text-lg text-theme-primary">{period.title}</span>
        <div className="w-10 h-10"></div> {/* Spacer */}
      </div>

      {/* Main Card */}
      <div className="relative w-full aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl border border-black/5 bg-black">
        {/* Image */}
        <img 
          src={message.image} 
          alt="Mensagem do dia" 
          className={`w-full h-full object-cover transition-all duration-700 ${isGenerating ? 'opacity-40 blur-md scale-105' : 'opacity-100 scale-100'}`}
        />
        
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black/80 pointer-events-none"></div>

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
            <RefreshCw size={32} className="animate-spin mb-4 text-theme-primary-container" />
            <p className="font-headline font-bold tracking-widest text-sm uppercase">Criando nova magia...</p>
          </div>
        )}

        {/* Text Content Overlay */}
        <div className={`absolute inset-0 p-6 sm:p-8 flex flex-col justify-between text-center transition-opacity duration-500 ${isGenerating ? 'opacity-0' : 'opacity-100'}`}>
          
          {/* Top Section */}
          <div className="flex flex-col items-center mt-2">
            <p className="font-headline font-bold text-theme-primary-container text-xs tracking-widest uppercase mb-4 drop-shadow-md">
              {period.title} QUERIDOS!
            </p>
            <h2 className="font-headline text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow-lg">
              {message.mainText}
            </h2>
          </div>

          {/* Bottom Section */}
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

      {/* Actions */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <button 
          onClick={onShare}
          className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-[#dcfce7] text-[#166534] active:scale-95 transition-transform shadow-sm"
        >
          <div className="flex gap-2">
            <Share2 size={20} />
            <Download size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-center">
            Compartilhar / Salvar
          </span>
        </button>

        <button 
          onClick={onGenerate}
          disabled={generationsRemaining <= 0 || isGenerating}
          className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-transform shadow-sm ${
            generationsRemaining > 0 && !isGenerating 
              ? 'bg-[#e0f2fe] text-[#075985] active:scale-95' 
              : 'bg-gray-100 text-gray-400'
          }`}
        >
          <RefreshCw size={20} className={isGenerating ? 'animate-spin' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-center">
            Gerar Nova ({generationsRemaining}/1 hoje)
          </span>
        </button>
      </div>

      {/* Copy Text Button */}
      <div className="mt-6 flex justify-center mb-8">
        <button 
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
