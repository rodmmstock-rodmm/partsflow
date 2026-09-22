import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

export function Breadcrumb({ items = [] }) {
  return (
    <nav className="breadcrumb" aria-label="ตำแหน่งปัจจุบัน">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-part">
            {item.onClick && !isLast ? (
              <button type="button" className="breadcrumb-link" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className={isLast ? "breadcrumb-current" : "breadcrumb-label"}>
                {item.label}
              </span>
            )}
            {!isLast && <span className="breadcrumb-sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

export function NotificationBell({ compact = false }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ safety_stock: 0, wait_confirm_steps: 0 });
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    function load() {
      apiGet("/notifications/summary/")
        .then((data) => alive && setSummary(data || {}))
        .catch(() => {});
    }
    load();
    const timer = setInterval(load, 90000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const total = (summary.safety_stock || 0) + (summary.wait_confirm_steps || 0);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className="notif-bell-wrap" ref={boxRef}>
      <button
        type="button"
        className={compact ? "m-icon-action" : "icon-btn"}
        aria-label={`การแจ้งเตือน${total ? ` (${total} รายการ)` : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        🔔
        {total > 0 && <span className="notif-badge">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">การแจ้งเตือน</div>
          {total === 0 ? (
            <div className="notif-empty">ไม่มีรายการค้างครับ 🎉</div>
          ) : (
            <>
              {summary.safety_stock > 0 && (
                <button type="button" className="notif-item" onClick={() => go("/safety-stock")}>
                  <span className="notif-item-icon danger">⚠</span>
                  <span>อะไหล่ต่ำกว่า Min <strong>{summary.safety_stock}</strong> รายการ</span>
                </button>
              )}
              {summary.wait_confirm_steps > 0 && (
                <button type="button" className="notif-item" onClick={() => go("/order-steps")}>
                  <span className="notif-item-icon warning">⏳</span>
                  <span>Step รอ Confirm <strong>{summary.wait_confirm_steps}</strong> รายการ</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-thumb shimmer" />
          <div className="skeleton-lines">
            <div className="skeleton-line shimmer" style={{ width: "40%" }} />
            <div className="skeleton-line shimmer" style={{ width: "75%" }} />
            <div className="skeleton-line shimmer" style={{ width: "55%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 6, columns = 6 }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: count }).map((_, i) => (
        <div
          className="skeleton-table-row"
          key={i}
          style={{ "--cols": columns }}
        >
          {Array.from({ length: columns }).map((__, j) => (
            <div className="skeleton-line shimmer" key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange, disabled = false, compact = false }) {
  const total = Math.max(1, Number(totalPages) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), total);

  function visiblePages() {
    const delta = compact ? 1 : 2;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [1];
    let start = Math.max(2, current - delta);
    let end = Math.min(total - 1, current + delta);

    if (current === 1) end = Math.min(total - 1, 1 + delta * 2);
    else if (current === total) start = Math.max(2, total - delta * 2);

    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("...");
    pages.push(total);
    return pages;
  }

  function go(target) {
    const next = Math.min(Math.max(1, target), total);
    if (next !== current) onChange(next);
  }

  return (
    <nav className="pagination" aria-label="เปลี่ยนหน้า">
      <button
        type="button"
        className="pagination-nav"
        disabled={disabled || current === 1}
        onClick={() => go(current - 1)}
      >
        ← {compact ? "" : "ก่อนหน้า"}
      </button>
      {!compact &&
        visiblePages().map((p, i) =>
          p === "..." ? (
            <span className="pagination-ellipsis" key={`e-${i}`}>
              ···
            </span>
          ) : (
            <button
              type="button"
              key={p}
              className={`pagination-item ${p === current ? "active" : ""}`}
              aria-current={p === current ? "page" : undefined}
              disabled={disabled}
              onClick={() => go(p)}
            >
              {p}
            </button>
          )
        )}
      {compact && (
        <span className="pagination-compact-label">
          {current} / {total}
        </span>
      )}
      <button
        type="button"
        className="pagination-nav"
        disabled={disabled || current === total}
        onClick={() => go(current + 1)}
      >
        {compact ? "" : "ถัดไป"} →
      </button>
    </nav>
  );
}

export function SearchableSelect({
  options: staticOptions = [],
  onSearch,
  initialLabel = "",
  value = "",
  onChange,
  getLabel = (option) => option?.name || "",
  getSearchText,
  placeholder = "พิมพ์เพื่อค้นหา...",
  disabled = false,
  required = false,
  emptyText = "ไม่พบข้อมูล",
  className = "",
}) {
  const remote = typeof onSearch === "function";
  const [remoteOptions, setRemoteOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const options = remote ? remoteOptions : staticOptions;
  const selected = options.find((option) => String(option.id) === String(value));
  const [query, setQuery] = useState(() => {
    if (selected) return getLabel(selected);
    if (remote && value) return initialLabel;
    return "";
  });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const closeTimer = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (!open) {
      if (selected) setQuery(getLabel(selected));
      else if (remote && value) setQuery(initialLabel);
      else if (!remote) setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selected, open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  // Remote mode: debounce the typed text and ask the backend for matches,
  // instead of requiring the entire list (e.g. every Part in the system)
  // to already be loaded client-side just so this field can filter it.
  useEffect(() => {
    if (!remote || !open) return;
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await onSearch(query.trim());
        setRemoteOptions(results || []);
      } catch {
        setRemoteOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, open, query]);

  const needle = query.trim().toLowerCase();
  const filtered = remote
    ? options
    : options
        .filter((option) => {
          if (!needle || (selected && query === getLabel(selected))) return true;
          const text = getSearchText
            ? getSearchText(option)
            : `${getLabel(option)} ${option?.code || ""} ${option?.email || ""}`;
          return String(text || "").toLowerCase().includes(needle);
        })
        .slice(0, 80);

  function choose(option) {
    window.clearTimeout(closeTimer.current);
    setQuery(getLabel(option));
    setOpen(false);
    setActiveIndex(0);
    onChange?.(String(option.id), option);
  }

  function clearSelection(nextQuery = "") {
    setQuery(nextQuery);
    setOpen(true);
    setActiveIndex(0);
    if (value) onChange?.("", null);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected ? getLabel(selected) : remote && value ? initialLabel : "");
    }
  }

  return (
    <div className={`searchable-select ${className}`}>
      <input
        value={query}
        disabled={disabled}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => {
          window.clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = window.setTimeout(() => {
            setOpen(false);
            setQuery(selected ? getLabel(selected) : remote && value ? initialLabel : "");
          }, 150);
        }}
        onChange={(event) => clearSelection(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {value && !disabled && (
        <button
          type="button"
          className="searchable-clear"
          aria-label="ล้างค่าที่เลือก"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => clearSelection("")}
        >
          ×
        </button>
      )}
      {open && !disabled && (
        <div className="searchable-menu" role="listbox">
          {searching ? (
            <span className="searchable-empty">กำลังค้นหา...</span>
          ) : filtered.length ? filtered.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.id) === String(value)}
              className={index === activeIndex ? "active" : ""}
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {getLabel(option)}
            </button>
          )) : <span className="searchable-empty">{remote && !needle ? "พิมพ์เพื่อค้นหา..." : emptyText}</span>}
        </div>
      )}
    </div>
  );
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

// วัน/เดือน/ปี (ค.ศ.) - used everywhere instead of toLocaleDateString("th-TH"),
// which silently renders the Buddhist Era year (e.g. 2569) instead of AD.
export function formatDMY(value, withTime = false) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const datePart = `${dd}/${mm}/${yyyy}`;
  if (!withTime) return datePart;
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${datePart} ${hh}:${min}`;
}

// Items whose Part ID starts with "N" are bulk/uncountable stock (wire,
// tape, tubing, etc. that gets cut to length) - showing a precise number
// is misleading, so the stock quantity display is replaced with a prompt
// to physically check on-site instead.
export const isNoCountSku = (sku) => String(sku || "").trim().toUpperCase().startsWith("N");
export const stockDisplay = (part) =>
  isNoCountSku(part?.sku) ? "เช็คหน้างาน" : fmt(part?.stock_qty);
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
