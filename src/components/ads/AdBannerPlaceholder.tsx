export function AdBannerPlaceholder({ position: _position }: { position: 'top' | 'bottom' }) {
  return (
    <div className="w-full px-4 py-2 bg-theme-surface z-40">
      <div className="w-full h-[72px] bg-white rounded-xl shadow-sm border border-gray-100 flex items-center px-4 gap-3 relative overflow-hidden">
        <div className="absolute top-0 left-0 bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-br">
          Ad
        </div>

        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shrink-0">
          <div className="w-6 h-6 border-2 border-gray-300 border-dashed rounded-sm" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 truncate">Sponsor App Name</h4>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="text-yellow-400">★</span>
            <span>4.8</span>
            <span className="mx-1">•</span>
            <span>GRÁTIS</span>
          </div>
        </div>

        <button
          type="button"
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-full hover:bg-blue-700 transition-colors shrink-0"
        >
          Obter
        </button>
      </div>
    </div>
  );
}
