import type { ReactNode } from 'react';

export function IconCircleButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-theme-primary ${className}`}
    >
      {children}
    </button>
  );
}
