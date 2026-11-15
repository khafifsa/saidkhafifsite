/** @jsxImportSource react */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { iconSvg, type IconName } from '../lib/icons';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <span className={`ic ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg(name, 'icon') }} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Icon name="loader" className="spin" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ toasts */

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'info' ? 'info' : 'check'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ modal */

export function Modal({
  title,
  children,
  onClose,
  actions,
  tone,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  tone?: 'danger';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${tone === 'danger' ? 'modal-danger' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <h2>{title}</h2>
        <div className="modal-content">{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}

export function Confirm({
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      tone={danger ? 'danger' : undefined}
      actions={
        <>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
        </>
      }
    >
      {text}
    </Modal>
  );
}

/* ------------------------------------------------------------------ progress overlay */

export function ProgressOverlay({ label, ratio }: { label: string; ratio: number }) {
  return (
    <div className="overlay" role="alertdialog" aria-live="assertive" aria-label="جارٍ الحفظ">
      <div className="overlay-card">
        <Icon name="loader" className="spin big" />
        <p>{label}…</p>
        <div className="bar">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0.04, ratio)) * 100)}%` }} />
        </div>
        <small>يُرجى عدم إغلاق الصفحة حتى ينتهي الحفظ.</small>
      </div>
    </div>
  );
}

export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="emblem">
      <path d="M50 3L97 50L50 97L3 50ZM16.8 16.8H83.2V83.2H16.8Z" fill="#cfa448" stroke="#7d5714" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="31.5" fill="#0e4a38" stroke="#f3e2b5" strokeWidth="1.6" />
      <g
        transform="translate(34.4 34.4) scale(1.3)"
        fill="none"
        stroke="#f6ecd2"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: iconSvg('scale').replace(/^<svg[^>]*>|<\/svg>$/g, '') }}
      />
    </svg>
  );
}
