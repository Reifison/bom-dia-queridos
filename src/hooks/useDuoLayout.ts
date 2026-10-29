import { useEffect, useState, type CSSProperties } from 'react';
import { getDuoPanes, type DuoLayoutGeometry, type LayoutRect } from '../lib/duoLayout';

declare global { interface Window { __duoLayout?: DuoLayoutGeometry } }

const paneStyle = (rect: LayoutRect): CSSProperties => ({
  position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
});

export function useDuoLayout() {
  const [geometry, setGeometry] = useState(() => window.__duoLayout);
  useEffect(() => {
    const update = () => setGeometry(window.__duoLayout);
    window.addEventListener('duolayoutchange', update);
    update();
    return () => window.removeEventListener('duolayoutchange', update);
  }, []);
  const panes = geometry && getDuoPanes(geometry);
  return panes ? { preview: paneStyle(panes.preview), commands: paneStyle(panes.commands) } : null;
}
