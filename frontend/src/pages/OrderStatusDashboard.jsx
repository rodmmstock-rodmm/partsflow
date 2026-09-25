import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Alert, PageHeader, SearchableSelect } from "../components/Common";

const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function pieSlicePath(cx, cy, r, angleStart, angleEnd) {
  const rad = (deg) => (Math.PI / 180) * deg;
  const largeArc = angleEnd - angleStart > 180 ? 1 : 0;
  const x1 = cx + r * Math.cos(rad(angleStart));
  const y1 = cy + r * Math.sin(rad(angleStart));
  const x2 = cx + r * Math.cos(rad(angleEnd));
  const y2 = cy + r * Math.sin(rad(angleEnd));
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} วัน`);
  if (hours) parts.push(`${hours} ชม.`);
  if (!days && minutes) parts.push(`${minutes} นาที`);
  if (!parts.length) return "ไม่ถึง 1 นาที";
  return parts.join(" ");
}

/* ---------------------------------------------------------------------
 * Section 1: monthly overview — one big pie + month dropdown, styled
 * after the interactive-pie-chart reference (select drives which slice
 * is spotlighted and what the center readout shows).
 * ------------------------------------------------------------------- */

const MONTH_SLICE_COLORS = {
  pending: "#7c3aed",
  completed: "#059669",
  cancelled: "#e11d48",
};
const MONTH_SLICE_ORDER = ["pending", "completed", "cancelled"];
const MONTH_SLICE_LABELS = {
  pending: "ยังไม่ Completed (รอของ)",
  completed: "Completed",
  cancelled: "ยกเลิก",
};

function MonthlyPie({ month, size = 200 }) {
  const total = month.total;
  const r = size / 2;
  const cx = r;
  const cy = r;
  const rBase = r * 0.72;
  const rActive = r * 0.9;

  if (!total) {
    return (
      <div className="order-status-pie-wrap" style={{ width: size, height: size }}>
        <div className="order-pie-empty" style={{ width: size, height: size }}>
          ไม่มี Order เดือนนี้
        </div>
      </div>
    );
  }

  let angleStart = -90;
  const slices = [];
  for (const key of MONTH_SLICE_ORDER) {
    const value = month[key] || 0;
    if (!value) continue;
    const isActive = key === "pending";
    const angle = Math.min((value / total) * 360, 359.999);
    const angleEnd = angleStart + angle;
    slices.push(
      <path
        key={key}
        d={pieSlicePath(cx, cy, isActive ? rActive : rBase, angleStart, angleEnd)}
        fill={MONTH_SLICE_COLORS[key]}
        stroke={isActive ? "var(--surface-2, #fff)" : "none"}
        strokeWidth={isActive ? 3 : 0}
      >
        <title>{`${MONTH_SLICE_LABELS[key]}: ${value}`}</title>
      </path>
    );
    angleStart = angleEnd;
  }

  return (
    <div className="order-status-pie-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {slices}
      </svg>
      <div className="order-status-pie-center">
        <span className="order-status-pie-center-num">{month.pending}</span>
        <span className="order-status-pie-center-label">Order รอของ</span>
      </div>
    </div>
  );
}

function MonthlyStatusSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiGet(`/orders/status-dashboard/?year=${year}`)
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year]);

  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) yearOptions.push(y);

  const yearTotal = data ? data.months.reduce((sum, m) => sum + m.total, 0) : 0;
  const yearCompleted = data ? data.months.reduce((sum, m) => sum + m.completed, 0) : 0;
  const yearCancelled = data ? data.months.reduce((sum, m) => sum + m.cancelled, 0) : 0;
  const yearPending = data ? data.months.reduce((sum, m) => sum + m.pending, 0) : 0;
  const selectedMonth = data ? data.months[monthIdx] : null;

  return (
    <>
      <PageHeader
        title="Dashboard สถานะ Order"
        subtitle="ภาพรวมจำนวน Order แต่ละสถานะปัจจุบัน แยกตามเดือนที่สร้าง (ไม่รวม Order ที่ถูกลบ)"
        actions={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                ปี {y}
              </option>
            ))}
          </select>
        }
      />
      <Alert>{error}</Alert>

      {loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : data ? (
        <>
          <div className="kpi-grid three">
            <div className="kpi-card">
              <small>Order ทั้งปี {year}</small>
              <strong>{yearTotal}</strong>
            </div>
            <div className="kpi-card">
              <small>Completed ทั้งปี</small>
              <strong>{yearCompleted}</strong>
            </div>
            <div className="kpi-card">
              <small>ยังไม่มา (รอของทุกเดือน)</small>
              <strong>{yearPending}</strong>
            </div>
          </div>

          <div className="order-status-month-picker">
            <label>
              <span>เลือกเดือน</span>
              <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}>
                {data.months.map((m, i) => (
                  <option key={m.month} value={i}>
                    {m.month_label} · {m.total} Order
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedMonth && (
            <div className="order-status-month-detail">
              <MonthlyPie month={selectedMonth} />
              <div className="order-status-month-legend">
                {MONTH_SLICE_ORDER.map((key) => (
                  <div className="order-status-legend-item" key={key}>
                    <span
                      className="order-status-legend-dot"
                      style={{ background: MONTH_SLICE_COLORS[key] }}
                    />
                    <span className="order-status-legend-text">{MONTH_SLICE_LABELS[key]}</span>
                    <span className="order-status-legend-value">{selectedMonth[key]}</span>
                  </div>
                ))}
                <div className="order-status-legend-item order-status-legend-total">
                  <span className="order-status-legend-text">รวมทั้งเดือน</span>
                  <span className="order-status-legend-value">{selectedMonth.total}</span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {data && yearCancelled > 0 && (
        <p className="order-status-note">ยกเลิกทั้งปี {yearCancelled} Order</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------
 * Section 2: look up one order — search box, pie of the 5 working
 * stages sized by accumulated real time (all visits summed together),
 * current stage spotlighted with a live duration readout.
 * ------------------------------------------------------------------- */

const WORKING_STAGES = [
  "New Order",
  "Wait Quotation",
  "Wait Issue P/R",
  "Wait for Item",
  "Wait Confirm",
];
const WORKING_STAGE_COLORS = ["#CECBF6", "#AFA9EC", "#7F77DD", "#534AB7", "#3C3489"];

function aggregateStages(segments) {
  const totals = {};
  let currentLabel = null;
  let currentSegSeconds = 0;
  for (const seg of segments || []) {
    if (!WORKING_STAGES.includes(seg.stage_label)) continue;
    totals[seg.stage_label] = (totals[seg.stage_label] || 0) + seg.duration_seconds;
    if (seg.is_current) {
      currentLabel = seg.stage_label;
      currentSegSeconds = seg.duration_seconds;
    }
  }
  return { totals, currentLabel, currentSegSeconds };
}

function OrderDurationPie({ totals, currentLabel, size = 220 }) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const r = size / 2;
  const cx = r;
  const cy = r;
  const rBase = r * 0.71;
  const rActive = r * 0.87;

  if (!total) {
    return (
      <div className="order-status-pie-wrap" style={{ width: size, height: size }}>
        <div className="order-pie-empty" style={{ width: size, height: size }}>
          ยังไม่มีข้อมูล
        </div>
      </div>
    );
  }

  let angleStart = -90;
  const slices = [];
  WORKING_STAGES.forEach((label, i) => {
    const value = totals[label] || 0;
    if (!value) return;
    const isActive = label === currentLabel;
    const angle = Math.min((value / total) * 360, 359.999);
    const angleEnd = angleStart + angle;
    slices.push(
      <path
        key={label}
        d={pieSlicePath(cx, cy, isActive ? rActive : rBase, angleStart, angleEnd)}
        fill={WORKING_STAGE_COLORS[i]}
        stroke={isActive ? "var(--surface-2, #fff)" : "none"}
        strokeWidth={isActive ? 3 : 0}
      >
        <title>{`${label}: ${formatDuration(value)}`}</title>
      </path>
    );
    angleStart = angleEnd;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices}
    </svg>
  );
}

function OrderDurationDisplay({ timeline }) {
  const { totals, currentLabel, currentSegSeconds } = aggregateStages(timeline.segments);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const isFinal = timeline.is_final;

  return (
    <div className="order-status-lookup-result">
      <div className="order-status-lookup-summary">
        <span className={`status ${isFinal ? "success" : "info"}`}>
          {timeline.current_stage_label}
        </span>
        {timeline.order_number && <span className="order-status-lookup-ordno">{timeline.order_number}</span>}
      </div>

      <div className="order-status-lookup-body">
        <div className="order-status-pie-wrap" style={{ width: 220, height: 220 }}>
          <OrderDurationPie totals={totals} currentLabel={isFinal ? null : currentLabel} />
          <div className="order-status-pie-center">
            {isFinal ? (
              <>
                <span className="order-status-pie-center-num order-status-pie-check">✓</span>
                <span className="order-status-pie-center-label">{timeline.current_stage_label}</span>
              </>
            ) : (
              <>
                <span className="order-status-pie-center-dur">{formatDuration(currentSegSeconds)}</span>
                <span className="order-status-pie-center-label">{currentLabel || "-"}</span>
              </>
            )}
          </div>
        </div>

        <div className="order-status-lookup-legend">
          <div className="order-status-total-box">
            <small>รวมทั้งหมด</small>
            <strong>{formatDuration(total)}</strong>
          </div>
          {WORKING_STAGES.map((label, i) => (
            <div
              className={`order-status-legend-item${label === currentLabel && !isFinal ? " active" : ""}`}
              key={label}
            >
              <span className="order-status-legend-dot" style={{ background: WORKING_STAGE_COLORS[i] }} />
              <span className="order-status-legend-text">{label}</span>
              <span className="order-status-legend-value">{formatDuration(totals[label] || 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {!timeline.has_full_history && (
        <div className="order-timeline-warning">
          ⚠️ Order นี้สร้างก่อนระบบเริ่มเก็บประวัติการเปลี่ยนสถานะ ช่วงแรกเป็นการประมาณเท่านั้น
        </div>
      )}
    </div>
  );
}

function OrderLookupSection() {
  const [orderId, setOrderId] = useState("");
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchOrders(q) {
    const query = q.trim();
    if (!query) return [];
    const res = await apiGet(`/orders/status-search/?q=${encodeURIComponent(query)}`);
    return res.results || [];
  }

  useEffect(() => {
    if (!orderId) {
      setTimeline(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    apiGet(`/orders/${orderId}/timeline/`)
      .then((res) => alive && setTimeline(res))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderId]);

  return (
    <div className="order-status-lookup-section">
      <h3>ดูราย Order</h3>
      <div className="order-status-lookup-search">
        <SearchableSelect
          onSearch={searchOrders}
          value={orderId}
          onChange={(id) => setOrderId(id)}
          getLabel={(o) => o.order_number}
          getSearchText={(o) => o.order_number}
          placeholder="พิมพ์เลข Order เพื่อค้นหา"
          emptyText="ไม่พบ Order"
        />
      </div>
      <Alert>{error}</Alert>
      {loading && <div className="empty">กำลังโหลด...</div>}
      {timeline && !loading && <OrderDurationDisplay timeline={timeline} />}
    </div>
  );
}

export default function OrderStatusDashboard() {
  return (
    <>
      <MonthlyStatusSection />
      <OrderLookupSection />
    </>
  );
}
