import { createContext, useCallback, useContext, useRef, useState } from "react";

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const idRef = useRef(0);

  const showToast = useCallback((message, type = "success") => {
    if (!message) return;
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ message, options, resolve });
    });
  }, []);

  function resolveConfirm(result) {
    confirmState?.resolve(result);
    setConfirmState(null);
  }

  return (
    <FeedbackContext.Provider value={{ showToast, confirm }}>
      {children}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role="status"
            onClick={() => dismissToast(t.id)}
          >
            <span className="toast-icon">
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
            </span>
            <span className="toast-message">{t.message}</span>
          </div>
        ))}
      </div>

      {confirmState && (
        <div
          className="confirm-overlay"
          onClick={() => resolveConfirm(false)}
        >
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            {confirmState.options.title && (
              <h3>{confirmState.options.title}</h3>
            )}
            <p>{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => resolveConfirm(false)}>
                {confirmState.options.cancelLabel || "ยกเลิก"}
              </button>
              <button
                className={`btn ${confirmState.options.danger ? "danger" : "primary"}`}
                onClick={() => resolveConfirm(true)}
                autoFocus
              >
                {confirmState.options.confirmLabel || "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return ctx;
}
