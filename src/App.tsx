import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Home } from 'lucide-react';
import { AdBannerPlaceholder } from './components/ads/AdBannerPlaceholder';
import { InterstitialAdMock } from './components/ads/InterstitialAdMock';
import { SettingsNavButton } from './components/navigation/SettingsNavButton';
import { ADS_ENABLED, SHOW_SETTINGS_NAV } from './constants/featureFlags';
import { INITIAL_MESSAGES } from './constants/content';
import { DetailView } from './features/detail/DetailView';
import { HomeView } from './features/home/HomeView';
import { useDailyGeneration } from './hooks/useDailyGeneration';
import { devLog } from './lib/logger';
import {
  getTodayLocal,
  loadSessionPeriodDayMessages,
  saveSessionPeriodDayMessage,
} from './lib/periodDayCache';
import type { DailyMessage, Period, PeriodId } from './types/period';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'detail'>('home');
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [currentMessage, setCurrentMessage] = useState<DailyMessage | null>(null);
  const [periodTodayMessages, setPeriodTodayMessages] = useState(() => loadSessionPeriodDayMessages());
  const periodTodayMessagesRef = useRef(periodTodayMessages);
  periodTodayMessagesRef.current = periodTodayMessages;

  const { generationsRemaining, isGenerating, generateForPeriod, autoGenerateForPeriod } =
    useDailyGeneration();

  const [showInterstitial, setShowInterstitial] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState<Period | null>(null);

  const goToDetail = (period: Period) => {
    setSelectedPeriod(period);
    const today = getTodayLocal();
    const hit = periodTodayMessagesRef.current[period.id];
    setCurrentMessage(hit?.day === today ? hit.message : INITIAL_MESSAGES[period.id]);
    setCurrentView('detail');
  };

  const handleSelectPeriod = (period: Period) => {
    if (ADS_ENABLED) {
      setPendingPeriod(period);
      setShowInterstitial(true);
    } else {
      goToDetail(period);
    }
  };

  const proceedToDetail = () => {
    setShowInterstitial(false);
    if (pendingPeriod) {
      goToDetail(pendingPeriod);
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

  const persistPeriodDayMessage = useCallback((periodId: PeriodId, msg: DailyMessage) => {
    const today = getTodayLocal();
    setPeriodTodayMessages((prev) => {
      const next = { ...prev, [periodId]: { day: today, message: msg } };
      saveSessionPeriodDayMessage(periodId, today, msg);
      return next;
    });
  }, []);

  const handleGenerateNew = () => {
    if (!selectedPeriod) return;
    void generateForPeriod(selectedPeriod.id, (msg) => {
      setCurrentMessage(msg);
      persistPeriodDayMessage(selectedPeriod.id, msg);
    });
  };

  useEffect(() => {
    if (currentView !== 'detail' || !selectedPeriod) return;
    const pid = selectedPeriod.id;
    const today = getTodayLocal();
    if (periodTodayMessagesRef.current[pid]?.day === today) return;

    let cancelled = false;
    void autoGenerateForPeriod(pid, (msg) => {
      if (cancelled) return;
      setCurrentMessage(msg);
      persistPeriodDayMessage(pid, msg);
    });
    return () => {
      cancelled = true;
    };
  }, [currentView, selectedPeriod?.id, autoGenerateForPeriod, persistPeriodDayMessage]);

  const handleShare = async () => {
    if (!currentMessage || !selectedPeriod) return;

    const text = `${selectedPeriod.title} queridos! ✨\n\n${currentMessage.mainText}${currentMessage.quote ? `\n\n${currentMessage.quote}` : ''}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mensagem do Dia',
          text,
        });
      } catch (err) {
        devLog.info('Share cancelled or failed');
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert('Texto copiado para a área de transferência!');
    }
  };

  return (
    <div className="min-h-screen bg-theme-surface flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-theme-surface relative flex flex-col shadow-2xl overflow-hidden">
        <AnimatePresence>
          {ADS_ENABLED && showInterstitial && (
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

        {ADS_ENABLED && <AdBannerPlaceholder position="top" />}

        <AnimatePresence mode="wait">
          {currentView === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className={ADS_ENABLED ? 'flex-1 overflow-y-auto pb-40' : 'flex-1 overflow-y-auto pb-24'}
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
              className={ADS_ENABLED ? 'flex-1 overflow-y-auto pb-40 bg-theme-surface' : 'flex-1 overflow-y-auto pb-24 bg-theme-surface'}
            >
              {selectedPeriod && currentMessage && (
                <DetailView
                  period={selectedPeriod}
                  message={currentMessage}
                  onBack={handleBack}
                  onShare={handleShare}
                  onGenerate={handleGenerateNew}
                  isGenerating={isGenerating}
                  generationsRemaining={generationsRemaining[selectedPeriod.id] ?? 0}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-0 left-0 w-full z-50 flex flex-col">
          {ADS_ENABLED && <AdBannerPlaceholder position="bottom" />}

          <div className="w-full h-20 flex justify-around items-center px-8 pb-2 bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
            <button
              type="button"
              className="flex flex-col items-center justify-center bg-theme-primary-container/20 text-theme-primary rounded-full px-6 py-1.5 transition-all duration-300 scale-105"
            >
              <Home size={22} className="fill-current" />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Início</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center justify-center text-theme-on-surface/40 px-6 py-1.5 hover:text-theme-primary transition-colors"
            >
              <Bookmark size={22} />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Salvos</span>
            </button>
            {SHOW_SETTINGS_NAV && <SettingsNavButton />}
          </div>
        </div>
      </div>
    </div>
  );
}
