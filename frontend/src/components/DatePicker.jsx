import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTHS_TH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const WEEKDAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" -> { y, m (0-11), d } without going through Date/UTC, so the
// day never shifts with the browser's timezone.
function parseISO(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const check = new Date(y, m, d);
  if (check.getFullYear() !== y || check.getMonth() !== m || check.getDate() !== d) return null;
  return { y, m, d };
}

const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const toDMY = (parts) => (parts ? `${pad(parts.d)}/${pad(parts.m + 1)}/${parts.y}` : "");

// "31122026" style digits -> masked "31/12/2026"
function maskDigits(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDMY(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]) - 1;
  const y = Number(match[3]);
  if (y < 1900 || y > 2200) return null;
  const check = new Date(y, m, d);
  if (check.getFullYear() !== y || check.getMonth() !== m || check.getDate() !== d) return null;
  return { y, m, d };
}

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = first.getDay(); // Sunday-first
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - lead + i);
    cells.push({
      y: date.getFullYear(),
      m: date.getMonth(),
      d: date.getDate(),
      outside: date.getMonth() !== month,
    });
  }
  return cells;
}

const POP_WIDTH = 292;

export default function DatePicker({
  value = "",
  onChange,
  disabled = false,
  placeholder = "วว/ดด/ปปปป",
  className = "",
}) {
  const selected = useMemo(() => parseISO(value), [value]);
  const [text, setText] = useState(toDMY(selected));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days"); // "days" | "months"
  const [cursor, setCursor] = useState(() => selected || todayParts()); // month being shown
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popRef = useRef(null);

  // Keep the text box in step with the value coming from the parent.
  useEffect(() => {
    setText(toDMY(selected));
  }, [selected]);

  function place() {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popHeight = popRef.current?.offsetHeight || 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    let top;
    if (spaceBelow >= popHeight + 12) top = rect.bottom + 6; // fits below
    else if (rect.top >= popHeight + 12) top = rect.top - popHeight - 6; // fits above
    else top = Math.min(rect.bottom + 6, window.innerHeight - popHeight - 8); // neither: slide into view
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 8));
    setPos({ top: Math.max(8, top), left });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, cursor]);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (wrapRef.current?.contains(event.target) || popRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openPicker() {
    if (disabled) return;
    setCursor(selected || todayParts());
    setView("days");
    setOpen(true);
  }

  function commit(parts) {
    onChange?.(parts ? toISO(parts.y, parts.m, parts.d) : "");
    setOpen(false);
  }

  function handleTyping(event) {
    const masked = maskDigits(event.target.value);
    setText(masked);
    if (masked === "") {
      onChange?.("");
      return;
    }
    const parsed = parseDMY(masked);
    if (parsed) {
      onChange?.(toISO(parsed.y, parsed.m, parsed.d));
      setCursor(parsed);
    }
  }

  function handleBlur(event) {
    // Incomplete / impossible dates fall back to the last valid value.
    if (text && !parseDMY(text)) setText(toDMY(selected));
    // Tabbing away closes the calendar; clicking inside it does not (the
    // popover keeps focus on this input via onMouseDown preventDefault).
    if (!popRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openPicker();
    }
  }

  const today = todayParts();
  const cells = useMemo(() => buildMonthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);

  function shiftMonth(delta) {
    const date = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: date.getFullYear(), m: date.getMonth(), d: 1 });
  }

  const same = (a, b) => a && b && a.y === b.y && a.m === b.m && a.d === b.d;

  const popover = open
    ? createPortal(
        <div
          ref={popRef}
          className="date-pop"
          style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
          role="dialog"
          aria-label="เลือกวันที่"
          onMouseDown={(event) => event.preventDefault()}
        >
          {view === "days" ? (
            <>
              <div className="date-pop-head">
                <button type="button" className="date-pop-nav" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">
                  ‹
                </button>
                <button type="button" className="date-pop-title" onClick={() => setView("months")}>
                  {MONTHS_TH[cursor.m]} {cursor.y}
                  <span aria-hidden="true">▾</span>
                </button>
                <button type="button" className="date-pop-nav" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">
                  ›
                </button>
              </div>
              <div className="date-pop-week">
                {WEEKDAYS_TH.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="date-pop-grid">
                {cells.map((cell) => {
                  const isSel = same(cell, selected);
                  const isToday = same(cell, today);
                  return (
                    <button
                      type="button"
                      key={`${cell.y}-${cell.m}-${cell.d}`}
                      className={[
                        "date-pop-day",
                        cell.outside ? "outside" : "",
                        isSel ? "selected" : "",
                        isToday ? "today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => commit(cell)}
                    >
                      {cell.d}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="date-pop-head">
                <button
                  type="button"
                  className="date-pop-nav"
                  onClick={() => setCursor({ ...cursor, y: cursor.y - 1 })}
                  aria-label="ปีก่อนหน้า"
                >
                  ‹
                </button>
                <span className="date-pop-title static">{cursor.y}</span>
                <button
                  type="button"
                  className="date-pop-nav"
                  onClick={() => setCursor({ ...cursor, y: cursor.y + 1 })}
                  aria-label="ปีถัดไป"
                >
                  ›
                </button>
              </div>
              <div className="date-pop-months">
                {MONTHS_TH_SHORT.map((label, index) => (
                  <button
                    type="button"
                    key={label}
                    className={[
                      "date-pop-month",
                      selected && selected.y === cursor.y && selected.m === index ? "selected" : "",
                      today.y === cursor.y && today.m === index ? "today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      setCursor({ y: cursor.y, m: index, d: 1 });
                      setView("days");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="date-pop-foot">
            <button type="button" className="date-pop-link" onClick={() => commit(null)}>
              ล้างค่า
            </button>
            <button type="button" className="date-pop-link strong" onClick={() => commit(today)}>
              วันนี้
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`date-picker ${className}`} ref={wrapRef}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="date-picker-input"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={handleTyping}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={openPicker}
        onClick={() => !open && openPicker()}
      />
      <button
        type="button"
        className="date-picker-icon"
        tabIndex={-1}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-label="เปิดปฏิทิน"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {popover}
    </div>
  );
}
