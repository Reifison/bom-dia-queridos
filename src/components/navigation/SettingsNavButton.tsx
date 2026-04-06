import { Settings } from 'lucide-react';

export function SettingsNavButton() {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center text-theme-on-surface/40 px-6 py-1.5 hover:text-theme-primary transition-colors"
    >
      <Settings size={22} />
      <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Ajustes</span>
    </button>
  );
}
