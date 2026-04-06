import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function InterstitialAdMock({ onClose }: { onClose: () => void }) {
  const [timeLeft, setTimeLeft] = useState(3);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
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
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          >
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
        Este é um placeholder. Aqui o SDK do AdMob exibirá o anúncio em vídeo ou tela cheia antes de liberar o
        acesso à mensagem.
      </p>
    </div>
  );
}
