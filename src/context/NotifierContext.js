import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import './NotifierHost.css';

const NotifierContext = createContext(null);

/**
 * @typedef {Object} ToastOptions
 * @property {'info'|'success'|'warning'|'error'} [variant]
 * @property {number} [duration] ms; 0 = no auto-dismiss
 */

/**
 * @typedef {Object} ConfirmOptions
 * @property {string} [title]
 * @property {string} message
 * @property {string} [confirmLabel]
 * @property {string} [cancelLabel]
 * @property {boolean} [danger]
 */

export function NotifierProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  const toast = useCallback((message, opts = {}) => {
    const { variant = 'info', duration = 5200 } = opts;
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message: String(message), variant }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, duration);
    }
  }, []);

  /** @returns {Promise<boolean>} */
  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setDialog({
        title: opts.title || 'Confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'OK',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: !!opts.danger,
        resolve: (v) => {
          setDialog(null);
          resolve(v);
        },
      });
    });
  }, []);

  return (
    <NotifierContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="parkgo-notifier-root" aria-live="polite">
        <div className="parkgo-toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`parkgo-toast parkgo-toast--${t.variant}`} role="status">
              {t.message}
            </div>
          ))}
        </div>
        {dialog && (
          <div
            className="parkgo-dialog-overlay"
            role="presentation"
            onClick={() => dialog.resolve(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') dialog.resolve(false);
            }}
          >
            <div
              className="parkgo-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="parkgo-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="parkgo-dialog-title" className="parkgo-dialog-title">
                {dialog.title}
              </h3>
              <p className="parkgo-dialog-message">{dialog.message}</p>
              <div className="parkgo-dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => dialog.resolve(false)}>
                  {dialog.cancelLabel}
                </button>
                <button
                  type="button"
                  className={`btn ${dialog.danger ? 'parkgo-btn-danger' : 'btn-primary'}`}
                  onClick={() => dialog.resolve(true)}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </NotifierContext.Provider>
  );
}

export function useNotifier() {
  const ctx = useContext(NotifierContext);
  if (!ctx) {
    throw new Error('useNotifier must be used within NotifierProvider');
  }
  return ctx;
}
