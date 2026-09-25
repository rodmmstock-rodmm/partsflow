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

/* A donut: pie wedges with a solid center disc on top, so the readout in
 * the middle always sits on one flat surface instead of straddling
 * whichever slice colors happen to pass behind it. */
function Donut({ size, slices, holeRatio = 0.62, gradientId, children }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const holeR = r * holeRatio;
  let angleStart = -90;
  const paths = [];
  for (const slice of slices) {
    if (!slice.value) continue;
    const rOuter = slice.active ? r : r * 0.92;
    const angleEnd = angleStart + slice.angle;
    paths.push(
      <path
        key={slice.key}
        d={pieSlicePath(cx, cy, rOuter, angleStart, angleEnd)}
        fill={slice.active && gradientId ? `url(#${gradientId})` : slice.color}
      >
        <title>{slice.title}</title>
      </path>
    );
    angleStart = angleEnd;
  }
  return (
    <div className="order-status-pie-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {gradientId && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand, #7c3aed)" />
              <stop offset="100%" stopColor="var(--brand2, #a78bfa)" />
            </linearGradient>
          </defs>
        )}
        {paths}
        <circle cx={cx} cy={cy} r={holeR} className="order-status-donut-hole" />
      </svg>
      <div className="order-status-pie-center">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Section 1: monthly overview — one donut + month dropdown, styled
 * after the interactive-pie-chart reference (select drives which slice
 * is spotlighted and what the center readout shows).
 * ------------------------------------------------------------------- */

const MONTH_SLICE_COLORS = {
  pending: "var(--brand, #7c3aed)",
  completed: "var(--success, #059669)",
  cancelled: "var(--danger, #e11d48)",
};
const MONTH_SLICE_ORDER = ["pending", "completed", "cancelled"];
const MONTH_SLICE_LABELS = {
  pending: "ยังไม่ Completed (รอของ)",
  completed: "Completed",
  cancelled: "ยกเลิก",
};

function arcPath(cx, cy, r, angleStart, angleEnd) {
  const rad = (deg) => (Math.PI / 180) * deg;
  const x1 = cx + r * Math.cos(rad(angleStart));
  const y1 = cy + r * Math.sin(rad(angleStart));
  const x2 = cx + r * Math.cos(rad(angleEnd));
  const y2 = cy + r * Math.sin(rad(angleEnd));
  const largeArc = angleEnd - angleStart >= 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function HalfRadialStacked({ pending, completed, width = 260, strokeWidth = 26 }) {
  const total = pending + completed;
  const r = (width - strokeWidth) / 2;
  const cx = width / 2;
  const cy = width / 2;
  const height = cy + strokeWidth / 2 + 4;

  if (!total) {
    return (
      <div className="order-pie-empty" style={{ width, height: width * 0.6 }}>
        ไม่มี Order เดือนนี้
      </div>
    );
  }

  const sweep = 180;
  const gapDeg = 5;
  const pendingAngle = Math.max(0, (pending / total) * sweep - gapDeg);
  const completedAngle = Math.max(0, (completed / total) * sweep - gapDeg);
  const pendingStart = 180;
  const pendingEnd = pendingStart + pendingAngle;
  const completedStart = pendingEnd + gapDeg;
  const completedEnd = completedStart + completedAngle;

  return (
    <div className="order-status-half-wrap" style={{ width, height }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <path
          d={arcPath(cx, cy, r, 180, 360)}
          className="order-status-radial-track"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <path
          d={arcPath(cx, cy, r, pendingStart, pendingEnd)}
          fill="none"
          stroke="#E4DBFB"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={arcPath(cx, cy, r, completedStart, completedEnd)}
          fill="none"
          stroke="url(#completedGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="completedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--brand2, #a78bfa)" />
            <stop offset="100%" stopColor="var(--brand, #7c3aed)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="order-status-half-center">
        <span className="order-status-half-num pending">{pending}</span>
        <span className="order-status-half-sep">/</span>
        <span className="order-status-half-num completed">{completed}</span>
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
            <div className="kpi-card info">
              <span>Order ทั้งปี {year}</span>
              <strong>{yearTotal}</strong>
            </div>
            <div className="kpi-card success">
              <span>Completed ทั้งปี</span>
              <strong>{yearCompleted}</strong>
            </div>
            <div className="kpi-card warning">
              <span>ยังไม่มา (รอของทุกเดือน)</span>
              <strong>{yearPending}</strong>
            </div>
          </div>

          <div className="panel order-status-panel">
            <div className="section-head">
              <h2>ภาพรวมรายเดือน</h2>
              <select
                className="order-status-month-select"
                value={monthIdx}
                onChange={(e) => setMonthIdx(Number(e.target.value))}
              >
                {data.months.map((m, i) => (
                  <option key={m.month} value={i}>
                    {m.month_label} · {m.total} Order
                  </option>
                ))}
              </select>
            </div>

            {selectedMonth && (
              <div className="order-status-half-block">
                <HalfRadialStacked pending={selectedMonth.pending} completed={selectedMonth.completed} />
                <div className="order-status-half-legend">
                  <span className="order-status-half-legend-item">
                    <span className="order-status-radial-dot pending" />
                    รอของ
                  </span>
                  <span className="order-status-half-legend-item">
                    <span className="order-status-radial-dot completed" />
                    รับของแล้ว
                  </span>
                </div>
                <div className="order-status-radial-total">รวมทั้งเดือน {selectedMonth.total} Order</div>
              </div>
            )}

            {yearCancelled > 0 && (
              <p className="order-status-note">ยกเลิกทั้งปี {yearCancelled} Order</p>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------
 * Section 2: look up one order — search box, donut of the 5 working
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
const WORKING_STAGE_COLORS = ["#ede9fe", "#c4b5fd", "#a78bfa", "#7c3aed", "var(--warning, #d97706)"];

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

function OrderDurationDisplay({ timeline }) {
  const { totals, currentLabel, currentSegSeconds } = aggregateStages(timeline.segments);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const isFinal = timeline.is_final;
  const activeLabel = isFinal ? null : currentLabel;

  const slices = total
    ? WORKING_STAGES.map((label, i) => ({
        key: label,
        value: totals[label] || 0,
        angle: Math.min(((totals[label] || 0) / total) * 360, 359.999),
        color: WORKING_STAGE_COLORS[i],
        active: label === activeLabel,
        title: `${label}: ${formatDuration(totals[label] || 0)}`,
      }))
    : [];

  return (
    <div className="order-status-lookup-result">
      <div className="order-status-lookup-summary">
        <span className={`status ${isFinal ? "success" : "info"}`}>
          {timeline.current_stage_label}
        </span>
        {timeline.order_number && (
          <span className="order-status-lookup-ordno">{timeline.order_number}</span>
        )}
      </div>

      <div className="order-status-donut-row">
        {total ? (
          <Donut size={216} slices={slices} gradientId="orderCurrentGradient">
            {isFinal ? (
              <>
                <span className="order-status-pie-check">✓</span>
                <span className="order-status-pie-center-label">{timeline.current_stage_label}</span>
              </>
            ) : (
              <>
                <span className="order-status-pie-center-dur">{formatDuration(currentSegSeconds)}</span>
                <span className="order-status-pie-center-label">{currentLabel || "-"}</span>
              </>
            )}
          </Donut>
        ) : (
          <div className="order-pie-empty" style={{ width: 216, height: 216 }}>
            ยังไม่มีข้อมูล
          </div>
        )}

        <div className="order-status-legend">
          <div className="order-status-total-box">
            <small>รวมทั้งหมด</small>
            <strong>{formatDuration(total)}</strong>
          </div>
          {WORKING_STAGES.map((label, i) => (
            <div
              className={`order-status-legend-item${label === activeLabel ? " active" : ""}`}
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
    <div className="panel order-status-panel order-status-lookup-panel">
      <div className="section-head">
        <h2>ดูราย Order</h2>
      </div>
      <div className="order-status-lookup-search">
        <svg className="order-status-search-icon"><use href="#ic-search" /></svg>
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
      {!timeline && !loading && (
        <p className="order-status-lookup-hint">พิมพ์เลข Order ด้านบนเพื่อดูว่าตอนนี้ค้างอยู่สถานะไหน นานแค่ไหนแล้ว</p>
      )}
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
