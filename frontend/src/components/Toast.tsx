import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
}

interface ToastContextValue {
  push: (tone: ToastTone, title: string, description?: string, action?: ToastAction) => void;
  success: (title: string, description?: string, action?: ToastAction) => void;
  error: (title: string, description?: string, action?: ToastAction) => void;
  info: (title: string, description?: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TONE_STYLES: Record<ToastTone, { icon: typeof CheckCircle2; iconClass: string; barClass: string }> = {
  success: { icon: CheckCircle2, iconClass: "text-emerald-500", barClass: "bg-emerald-500" },
  error: { icon: XCircle, iconClass: "text-red-500", barClass: "bg-red-500" },
  info: { icon: Info, iconClass: "text-brand-500", barClass: "bg-brand-500" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string, action?: ToastAction) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tone, title, description, action }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    push,
    success: (title, description, action) => push("success", title, description, action),
    error: (title, description, action) => push("error", title, description, action),
    info: (title, description, action) => push("info", title, description, action),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const style = TONE_STYLES[t.tone];
            const Icon = style.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-popover"
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${style.barClass}`} />
                <div className="flex items-start gap-3 py-3 pl-4 pr-3">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-sm text-slate-500">{t.description}</p>}
                    {t.action && (
                      <button
                        onClick={() => {
                          t.action!.onClick();
                          dismiss(t.id);
                        }}
                        className="mt-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
