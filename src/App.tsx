import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Home } from 'lucide-react';
import { SettingsNavButton } from './components/navigation/SettingsNavButton';
import { ADS_ENABLED, SHOW_SETTINGS_NAV } from './constants/featureFlags';
import { INITIAL_MESSAGES } from './constants/content';
import { DetailView } from './features/detail/DetailView';
import { HomeView } from './features/home/HomeView';
import { useDailyGeneration } from './hooks/useDailyGeneration';
import { devLog } from './lib/logger';
import {
  registerInterstitialShown,
  registerMessageOpening,
  shouldShowInterstitial,
} from './lib/adCadence';
import { composeShareImageFile } from './lib/shareImage';
import {
  getTodayLocal,
  loadSessionPeriodDayMessages,
  saveSessionPeriodDayMessage,
} from './lib/periodDayCache';
import type { DailyMessage, Period, PeriodId } from './types/period';
import { copyTextToClipboard, shareDailyMessage } from './services/shareDailyMessage';
import {
  hideHomeBanner,
  initializeMobileAds,
  preloadInterstitial,
  preloadRewarded,
  removeHomeBanner,
  showHomeBanner,
  showInterstitial,
  showTwoRewardedAds,
} from './services/mobileAds';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'detail'>('home');
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [currentMessage, setCurrentMessage] = useState<DailyMessage | null>(null);
  const [periodTodayMessages, setPeriodTodayMessages] = useState(() => loadSessionPeriodDayMessages());
  const periodTodayMessagesRef = useRef(periodTodayMessages);
  periodTodayMessagesRef.current = periodTodayMessages;

  const {
    generationsRemaining,
    isGenerating,
    generateForPeriod,
    autoGenerateForPeriod,
    grantRewardedCredits,
  } = useDailyGeneration();

  const [isSharing, setIsSharing] = useState(false);
  const [isUnlockingGenerations, setIsUnlockingGenerations] = useState(false);
  const [isShowingInterstitial, setIsShowingInterstitial] = useState(false);

  useEffect(() => {
    if (!ADS_ENABLED) return;
    let active = true;
    void initializeMobileAds().then((result) => {
      if (!active || !result.available || !result.canRequestAds) return;
      void preloadInterstitial();
      void preloadRewarded();
    });
    return () => {
      active = false;
      void removeHomeBanner();
    };
  }, []);

  useEffect(() => {
    if (!ADS_ENABLED) return;
    if (currentView === 'home' && !isShowingInterstitial) {
      void showHomeBanner();
    } else {
      void hideHomeBanner();
    }
  }, [currentView, isShowingInterstitial]);

  const goToDetail = (period: Period) => {
    if (ADS_ENABLED) registerMessageOpening();
    setSelectedPeriod(period);
    const today = getTodayLocal();
    const hit = periodTodayMessagesRef.current[period.id];
    setCurrentMessage(hit?.day === today ? hit.message : INITIAL_MESSAGES[period.id]);
    setCurrentView('detail');
  };

  const handleSelectPeriod = (period: Period) => goToDetail(period);

  const handleBack = () => {
    const willShowInterstitial = ADS_ENABLED && shouldShowInterstitial();
    if (willShowInterstitial) setIsShowingInterstitial(true);
    setCurrentView('home');
    if (willShowInterstitial) {
      void (async () => {
        await hideHomeBanner();
        try {
          if (await showInterstitial()) {
            registerInterstitialShown();
          }
        } finally {
          setIsShowingInterstitial(false);
        }
      })();
    }
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

  const handleGenerateNew = async () => {
    if (!selectedPeriod) return;
    if ((generationsRemaining[selectedPeriod.id] ?? 0) <= 0) {
      if (!ADS_ENABLED) {
        alert('Suas gerações de hoje acabaram. Volte amanhã para receber uma nova.');
        return;
      }
      const accepted = window.confirm(
        'Assista a 2 anúncios premiados para liberar 2 novas gerações hoje. Deseja continuar?'
      );
      if (!accepted) return;

      setIsUnlockingGenerations(true);
      try {
        const reward = await showTwoRewardedAds();
        if (reward.granted) {
          grantRewardedCredits(selectedPeriod.id);
          alert('Tudo certo! Você ganhou 2 novas gerações para este período hoje.');
        } else if (reward.results[0].reason === 'missing-ad-unit') {
          alert('Os anúncios premiados ainda não estão disponíveis nesta plataforma.');
        } else {
          alert('Não foi possível carregar os dois anúncios agora. Tente novamente em instantes.');
        }
      } finally {
        setIsUnlockingGenerations(false);
      }
      return;
    }
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
    if (!currentMessage || !selectedPeriod || isGenerating || isSharing) return;

    const text = `${selectedPeriod.title} queridos! ✨\n\n${currentMessage.mainText}${currentMessage.quote ? `\n\n${currentMessage.quote}` : ''}`;
    setIsSharing(true);
    try {
      const file = await composeShareImageFile({
        background: currentMessage.image,
        title: `${selectedPeriod.title} QUERIDOS!`,
        mainText: currentMessage.mainText,
        quote: currentMessage.quote,
        signature: 'App bom dia queridos',
      }, `${selectedPeriod.id}-${getTodayLocal()}.jpg`);
      const result = await shareDailyMessage(text, file, {
        title: 'Mensagem do Dia',
        dialogTitle: 'Compartilhar mensagem',
      });
      if (result === 'downloaded') {
        alert('Imagem baixada e texto copiado para a área de transferência.');
      } else if (result === 'copied') {
        alert('O texto foi copiado para a área de transferência.');
      }
    } catch (err) {
      devLog.error('Unable to share daily message', err);
      alert('Não foi possível preparar a imagem para compartilhar. Tente novamente.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyText = async () => {
    if (!currentMessage || !selectedPeriod) return;
    const text = `${selectedPeriod.title} queridos! ✨\n\n${currentMessage.mainText}${currentMessage.quote ? `\n\n${currentMessage.quote}` : ''}`;
    if (await copyTextToClipboard(text)) {
      alert('Texto copiado para a área de transferência!');
      return;
    }
    alert('Não foi possível copiar o texto.');
  };

  return (
    <div className="min-h-screen bg-theme-surface flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-theme-surface relative flex flex-col shadow-2xl overflow-hidden">
        <AnimatePresence mode="wait">
          {currentView === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 overflow-y-auto pb-40"
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
              className="flex-1 overflow-y-auto pb-24 bg-theme-surface"
            >
              {selectedPeriod && currentMessage && (
                <DetailView
                  period={selectedPeriod}
                  message={currentMessage}
                  onBack={handleBack}
                  onShare={handleShare}
                  onCopyText={handleCopyText}
                  onGenerate={handleGenerateNew}
                  isGenerating={isGenerating}
                  isSharing={isSharing}
                  isUnlockingGenerations={isUnlockingGenerations}
                  generationsRemaining={generationsRemaining[selectedPeriod.id] ?? 0}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-0 left-0 w-full z-50 flex flex-col">
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
