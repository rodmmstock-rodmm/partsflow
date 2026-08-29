import { useEffect, useRef, useState } from "react";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (title !== "เบิกอะไหล่") return undefined;

    const input = cardRef.current?.querySelector('input[type="number"]');
    if (!input) return undefined;

    input.min = "1";
    input.step = "1";
    input.inputMode = "numeric";

    const validateInteger = () => {
      if (input.value === "") {
        input.setCustomValidity("");
        return;
      }
      const amount = Number(input.value);
      input.setCustomValidity(
        Number.isInteger(amount) && amount > 0
          ? ""
          : "จำนวนเบิกต้องเป็นจำนวนเต็มมากกว่า 0"
      );
    };

    validateInteger();
    input.addEventListener("input", validateInteger);
    return () => input.removeEventListener("input", validateInteger);
  }, [title, children]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div ref={cardRef} className={`modal-card ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({ type = "error", children }) {
  if (!children) return null;
  return <div className={`alert ${type}`}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = "ค้นหา..." }) {
  return <input className="search-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export function DatalistInput({ label, value, onChange, options, getLabel, required = false, placeholder = "พิมพ์เพื่อค้นหา..." }) {
  const id = `dl-${label.replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} />
      <datalist id={id}>
        {options.map((x) => <option key={x.id || getLabel(x)} value={getLabel(x)} />)}
      </datalist>
    </label>
  );
}

export function Empty({ text = "ไม่พบข้อมูล" }) {
  return <div className="empty">{text}</div>;
}

export const fmt = (v) => Number(v || 0).toLocaleString("th-TH");
export const money = (v) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function resolveImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let normalized = raw;
  if (normalized.startsWith("www.")) normalized = `https://${normalized}`;
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === "drive.google.com" || host.endsWith(".drive.google.com")) {
      let fileId = "";
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
      const dMatch = url.pathname.match(/\/d\/([^/]+)/i);
      if (fileMatch) fileId = fileMatch[1];
      else if (dMatch) fileId = dMatch[1];
      else fileId = url.searchParams.get("id") || "";
      if (fileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
    }
    return url.toString();
  } catch {
    return normalized;
  }
}

export function PartImage({
  src,
  fallbackSrc = "",
  alt = "รูปอะไหล่",
}) {
  const primaryUrl = resolveImageUrl(src);
  const fallbackUrl = resolveImageUrl(fallbackSrc);

  const [currentUrl, setCurrentUrl] = useState(primaryUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentUrl(primaryUrl);
    setFailed(false);
  }, [primaryUrl, fallbackUrl]);

  if (!currentUrl || failed) {
    return (
      <span className="image-fallback" aria-label="ไม่มีรูป">
        📦
      </span>
    );
  }

  function handleError() {
    if (
      fallbackUrl &&
      currentUrl !== fallbackUrl
    ) {
      setCurrentUrl(fallbackUrl);
      return;
    }

    setFailed(true);
  }

  return (
    <img
      src={currentUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
}
