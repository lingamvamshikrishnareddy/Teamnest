'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Toast = { id: number; title: string; body?: string; tone: 'success' | 'error' };
const ToastContext = createContext<{ toast: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cn('pointer-events-auto flex gap-3 rounded-md border bg-surface-raised p-3 shadow-raised', t.tone === 'error' ? 'border-danger/40' : 'border-success/40')}>
            {t.tone === 'error' ? <AlertTriangle className="size-5 shrink-0 text-danger" /> : <CheckCircle2 className="size-5 shrink-0 text-success" />}
            <div className="flex-1 text-sm"><div className="font-semibold">{t.title}</div>{t.body ? <div className="text-text-muted">{t.body}</div> : null}</div>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="text-text-subtle hover:text-text"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
