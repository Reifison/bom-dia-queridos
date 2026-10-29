import { t } from './lib/locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Home } from 'lucide-react';
import { ADS_ENABLED } from './constants/featureFlags';
import { DetailView } from './features/detail/DetailView';
import { HomeView } from './features/home/HomeView';
import { useLocalDay } from './hooks/useLocalDay';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useMessageArt } from './hooks/useMessageArt';
import { registerInterstitialShown, registerContentAction, shouldShowInterstitial } from './lib/adCadence';
import { createDailyContentFlow, type ContentBusyPhase } from './lib/dailyContentFlow';
import { loadDailyQuota, saveDailyQuota } from './lib/dailyGeneration';
import { getOfflineDailyMessage } from './lib/offlineDailyContent';
import { addGeneratedBankImage, selectBankImage, selectBankMessage, type BankSelection } from './lib/personalImageBank';
import { getTodayLocal, loadPeriodDayMessages, savePeriodDayMessage, type PeriodDayEntry } from './lib/periodDayCache';
import { messageGreeting } from './lib/messageGreeting';
import { isOfflineReadyMessage, type DailyMessage, type Period, type PeriodId } from './types/period';
import { generateFirebaseImage, getFirebaseAiAvailability } from './services/firebaseImageService';
import { pickPersonalPhoto, prepareImageForBank } from './services/personalPhotoService';
import { copyTextToClipboard, shareDailyMessage } from './services/shareDailyMessage';
import { hideHomeBanner, initializeMobileAds, isInterstitialReady, isNativeAdsPlatform, preloadInterstitial, removeHomeBanner, showAdPrivacyOptions, showHomeBanner, showInterstitial } from './services/mobileAds';

const PERIOD_IDS: PeriodId[] = ['morning', 'afternoon', 'night'];

function cachedMessage(entry: PeriodDayEntry | undefined, day: string): DailyMessage | undefined {
  return entry?.day === day && isOfflineReadyMessage(entry.message) ? entry.message : undefined;
}

export default function App() {
  const today = useLocalDay();
  const online = useNetworkStatus();
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const selectedRef = useRef(selectedPeriod);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const [messages, setMessages] = useState<Partial<Record<PeriodId, PeriodDayEntry>>>({});
  const messagesRef = useRef(messages);
  const [cacheReadyDay, setCacheReadyDay] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const shareLock = useRef(false);
  const [busyPhase, setBusyPhase] = useState<ContentBusyPhase>(null);
  const busyRef = useRef<ContentBusyPhase>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const storeMessage = useCallback((message: DailyMessage, day: string) => {
    const next = { ...messagesRef.current, [message.periodId]: { day, message } };
    messagesRef.current = next;
    setMessages(next);
    void savePeriodDayMessage(message.periodId, day, message);
  }, []);

  const beforeContentAction = useCallback(async (isCurrent: () => boolean) => {
    if (!isCurrent() || !ADS_ENABLED || !onlineRef.current || !isNativeAdsPlatform()) return;
    registerContentAction();
    if (!shouldShowInterstitial()) return;
    if (!isInterstitialReady()) { void preloadInterstitial(); return; }
    await hideHomeBanner();
    if (!isCurrent()) return;
    if (await showInterstitial()) registerInterstitialShown();
  }, []);

  const [flow] = useState(() => createDailyContentFlow({
    currentDay: getTodayLocal,
    isCurrent: (period, day) => selectedRef.current?.id === period && getTodayLocal() === day,
    readMessage: (period, day) => cachedMessage(messagesRef.current[period], day) ?? getOfflineDailyMessage(period, day),
    writeMessage: storeMessage,
    selectImage: (period, day, excludeImage) => selectBankImage(period, day, { excludeImage }),
    selectText: (period, day, excludeText) => selectBankMessage(period, day, { excludeText }),
    generateAi: generateFirebaseImage,
    prepareAi: prepareImageForBank,
    saveAi: addGeneratedBankImage,
    pickPhoto: pickPersonalPhoto,
    aiAvailable: () => onlineRef.current && getFirebaseAiAvailability().available,
    readQuota: loadDailyQuota,
    writeQuota: saveDailyQuota,
    beforeAction: beforeContentAction,
    onBusy: (phase) => { busyRef.current = phase; setBusyPhase(phase); },
    onError: setActionError,
  }));

  const currentMessage = selectedPeriod
    ? cachedMessage(messages[selectedPeriod.id], today) ?? getOfflineDailyMessage(selectedPeriod.id, today)
    : null;
  const aiAvailability = getFirebaseAiAvailability();
  const recoverArtwork = useCallback((original: DailyMessage, replacement: BankSelection, day: string) => {
    if (day !== getTodayLocal() || selectedRef.current?.id !== original.periodId) return;
    const latest = cachedMessage(messagesRef.current[original.periodId], day);
    if (latest && (latest.image !== original.image || latest.mainText !== original.mainText ||
      latest.textPosition?.x !== original.textPosition?.x || latest.textPosition?.y !== original.textPosition?.y)) return;
    storeMessage({ ...original, image: replacement.image, bankImageId: replacement.imageId, source: replacement.source, offline: undefined }, day);
    setActionError(t('Usamos outra imagem do banco para preparar sua mensagem.'));
  }, [storeMessage]);
  const art = useMessageArt(currentMessage, selectedPeriod?.id, recoverArtwork);

  useEffect(() => {
    let active = true;
    flow.invalidate();
    setActionError(null);
    void (async () => {
      const stored = await loadPeriodDayMessages(today);
      if (!active) return;
      const prepared = await Promise.all(PERIOD_IDS.map(async (id) => {
        let message = cachedMessage(messagesRef.current[id], today) ?? cachedMessage(stored[id], today);
        if (message) {
          // Migrate existing AI artwork into the durable bank before tomorrow's
          // daily cache replaces it. Personal photos are deliberately excluded.
          if (message.source === 'firebase' && !message.bankImageId) {
            try {
              const saved = await addGeneratedBankImage(id, message.image, today);
              message = { ...message, bankImageId: saved.imageId };
            } catch { /* The existing daily image remains usable. */ }
          }
          return { id, message };
        }
        const previous = messagesRef.current[id]?.message;
        const image = await selectBankImage(id, today, { excludeImage: previous?.bankImageId ?? previous?.image });
        const mainText = await selectBankMessage(id, today, { excludeText: previous?.mainText });
        return { id, message: { periodId: id, image: image.image, bankImageId: image.imageId, source: image.source, mainText, generationFlow: { day: today, manualBankRefreshes: 0 } } satisfies DailyMessage };
      }));
      if (!active || getTodayLocal() !== today) return;
      const next: Partial<Record<PeriodId, PeriodDayEntry>> = {};
      for (const { id, message } of prepared) {
        const latest = cachedMessage(messagesRef.current[id], today);
        const committed = latest ?? message;
        next[id] = { day: today, message: committed };
        void savePeriodDayMessage(id, today, committed);
      }
      messagesRef.current = next;
      setMessages(next);
      setCacheReadyDay(today);
    })().catch(() => {
      if (!active) return;
      // A corrupt/unavailable bank must never take away the bundled greeting.
      const next = Object.fromEntries(PERIOD_IDS.map((id) => [id, { day: today, message: getOfflineDailyMessage(id, today) }]));
      messagesRef.current = next;
      setMessages(next);
      setCacheReadyDay(today);
    });
    return () => { active = false; };
  }, [today, flow]);

  useEffect(() => {
    if (!ADS_ENABLED || !online) return;
    let active = true;
    void initializeMobileAds().then((result) => {
      if (active && result.available && result.canRequestAds) void preloadInterstitial();
    });
    return () => { active = false; };
  }, [online]);

  useEffect(() => {
    if (!ADS_ENABLED) return;
    if (!selectedPeriod && !busyPhase && online) void showHomeBanner();
    else void hideHomeBanner();
  }, [selectedPeriod?.id, busyPhase, online]);
  useEffect(() => () => { flow.invalidate(); void removeHomeBanner(); }, [flow]);

  const selectPeriod = (period: Period) => {
    flow.invalidate();
    selectedRef.current = period;
    setSelectedPeriod(period);
    setActionError(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (ADS_ENABLED && online && isNativeAdsPlatform()) registerContentAction();
  };

  const goHome = () => {
    flow.invalidate();
    selectedRef.current = null;
    setSelectedPeriod(null);
    setActionError(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const generateNext = async () => {
    const period = selectedRef.current;
    if (!shareLock.current && period && cacheReadyDay === getTodayLocal()) await flow.generate(period.id, getTodayLocal());
  };
  const useMyPhoto = async () => {
    const period = selectedRef.current;
    if (!shareLock.current && period && cacheReadyDay === getTodayLocal()) await flow.usePersonalPhoto(period.id, getTodayLocal());
  };

  const movePersonalText = (textPosition?: { x: number; y: number }) => {
    const period = selectedRef.current;
    const day = getTodayLocal();
    if (!period || shareLock.current || busyRef.current || cacheReadyDay !== day) return;
    const message = cachedMessage(messagesRef.current[period.id], day);
    if (message?.source !== 'personal') return;
    storeMessage({ ...message, textPosition }, day);
  };

  const shareMessage = async () => {
    if (!currentMessage || !selectedPeriod || shareLock.current || busyRef.current) return;
    const requestPeriod = selectedPeriod.id;
    const requestDay = today;
    const isCurrent = () => selectedRef.current?.id === requestPeriod && getTodayLocal() === requestDay;
    shareLock.current = true;
    setIsSharing(true);
    try {
      const blob = await art.ensureBlob();
      const file = new File([blob], `${selectedPeriod.id}-${today}.jpg`, { type: blob.type });
      try { await beforeContentAction(isCurrent); } catch { /* Sharing continues if the ad fails. */ }
      if (!isCurrent()) return;
      const result = await shareDailyMessage(file, { dialogTitle: t('Compartilhar mensagem') });
      if (result === 'downloaded') alert(t('Imagem baixada. Use Copiar texto se quiser copiar a mensagem.'));
    } catch {
      alert(t('Não foi possível preparar a imagem para compartilhar. Tente novamente.'));
    } finally { shareLock.current = false; setIsSharing(false); }
  };

  const copyText = async () => {
    if (!currentMessage || !selectedPeriod) return;
    const text = `${messageGreeting(selectedPeriod.id)} ✨\n\n${currentMessage.mainText}${currentMessage.quote ? `\n\n${currentMessage.quote}` : ''}`;
    alert(await copyTextToClipboard(text) ? t('Texto copiado para a área de transferência!') : t('Não foi possível copiar o texto.'));
  };

  return (
    <div className="app-viewport bg-theme-surface">
      <div className="app-shell bg-theme-surface">
        <AnimatePresence mode="wait">
          {!selectedPeriod ? (
            <motion.div key="home" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="app-screen home-screen">
              <HomeView onSelect={selectPeriod} />
            </motion.div>
          ) : (
            <motion.div key={selectedPeriod.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="app-screen detail-screen bg-theme-surface">
              <DetailView period={selectedPeriod} message={currentMessage!} onBack={goHome} onShare={shareMessage} onCopyText={copyText}
                onGenerateNext={generateNext} onUsePhoto={useMyPhoto} busyPhase={busyPhase} isDayReady={cacheReadyDay === today}
                isSharing={isSharing} isPreparingArt={art.isPreparing} artPreviewUrl={art.url} artLayers={art.layers} onMoveText={movePersonalText}
                actionError={actionError} online={online} aiAvailable={aiAvailability.available} />
            </motion.div>
          )}
        </AnimatePresence>
        {!selectedPeriod && <nav aria-label={t("Navegação principal")} className="app-navigation">
          <div className="w-full h-20 flex justify-around items-center px-8 pb-2 bg-white/90 backdrop-blur-xl border-t border-gray-100">
            <button type="button" onClick={goHome} aria-current={!selectedPeriod ? 'page' : undefined} className="min-h-11 flex flex-col items-center justify-center text-theme-primary rounded-full px-6 py-1.5 focus-visible:outline-2 focus-visible:outline-theme-primary">
              <Home size={22} /><span className="text-xs font-bold mt-1">{t("Início")}</span>
            </button>
            {ADS_ENABLED && isNativeAdsPlatform() && online && (
              <button type="button" className="min-h-11 text-xs text-theme-on-surface-variant px-3 py-2" onClick={() => void showAdPrivacyOptions().then((shown) => {
                if (!shown) alert(t('Não há opções de anúncios disponíveis no momento. Tente novamente mais tarde.'));
              })}>{t("Privacidade dos anúncios")}</button>
            )}
          </div>
        </nav>}
      </div>
    </div>
  );
}
