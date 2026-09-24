import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [promptState, setPromptState] = useState(null);
  const [promptValue, setPromptValue] = useState("");
  const idRef = useRef(0);
  const promptInputRef = useRef(null);

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

  // promptText(message, options) -> Promise<string|null>
  // null means the person cancelled; otherwise the (possibly empty) text value.
  const promptText = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setPromptValue(options.defaultValue || "");
      setPromptState({ message, options, resolve });
    });
  }, []);

  function resolvePrompt(value) {
    promptState?.resolve(value);
    setPromptState(null);
    setPromptValue("");
  }

  useEffect(() => {
    if (promptState && promptInputRef.current) {
      promptInputRef.current.focus();
    }
  }, [promptState]);

  const maxLen = promptState?.options.maxLength;
  const overLimit = maxLen ? promptValue.length > maxLen : false;

  return (
    <FeedbackContext.Provider value={{ showToast, confirm, promptText }}>
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

      {promptState && (
        <div
          className="confirm-overlay"
          onClick={() => resolvePrompt(null)}
        >
          <div className="confirm-box prompt-box" onClick={(e) => e.stopPropagation()}>
            {promptState.options.title && <h3>{promptState.options.title}</h3>}
            <p>{promptState.message}</p>
            <textarea
              ref={promptInputRef}
              className="prompt-textarea"
              rows={promptState.options.rows || 3}
              placeholder={promptState.options.placeholder || ""}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) resolvePrompt(promptValue.trim());
                if (e.key === "Escape") resolvePrompt(null);
              }}
            />
            {maxLen && (
              <div className={`prompt-counter${overLimit ? " over" : ""}`}>
                {promptValue.length} / {maxLen}
              </div>
            )}
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => resolvePrompt(null)}>
                {promptState.options.cancelLabel || "ยกเลิก"}
              </button>
              <button
                className="btn primary"
                disabled={overLimit}
                onClick={() => resolvePrompt(promptValue.trim())}
              >
                {promptState.options.confirmLabel || "ยืนยัน"}
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
