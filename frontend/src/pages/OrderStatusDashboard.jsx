import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Alert, PageHeader } from "../components/Common";

const SLICE_COLORS = {
  "New Order": "#94a3b8",
  "Wait Quotation": "#c4b5fd",
  "Wait Issue P/R": "#a78bfa",
  "Wait for Item": "#7c3aed",
  "Wait Confirm": "#d97706",
  "Complete Order": "#059669",
  CANCELLED: "#e11d48",
  DELETED: "#475569",
};
const SLICE_ORDER = Object.keys(SLICE_COLORS);

function PieChart({ counts, total, size = 108 }) {
  if (!total) {
    return (
      <div className="order-pie-empty" style={{ width: size, height: size }}>
        ไม่มี Order
      </div>
    );
  }
  const r = size / 2;
  const cx = r;
  const cy = r;
  let angleStart = -90;
  const slices = [];
  for (const key of SLICE_ORDER) {
    const value = counts[key] || 0;
    if (!value) continue;
    const angle = Math.min((value / total) * 360, 359.999);
    const angleEnd = angleStart + angle;
    const largeArc = angle > 180 ? 1 : 0;
    const rad = (deg) => (Math.PI / 180) * deg;
    const x1 = cx + r * Math.cos(rad(angleStart));
    const y1 = cy + r * Math.sin(rad(angleStart));
    const x2 = cx + r * Math.cos(rad(angleEnd));
    const y2 = cy + r * Math.sin(rad(angleEnd));
    slices.push(
      <path
        key={key}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={SLICE_COLORS[key]}
      >
        <title>{`${key}: ${value}`}</title>
      </path>
    );
    angleStart = angleEnd;
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices}
    </svg>
  );
}

function MonthCard({ month }) {
  return (
    <div className="order-status-month-card">
      <div className="order-status-month-head">
        <b>{month.month_label}</b>
        <span>{month.total} Order</span>
      </div>
      <PieChart counts={month.counts} total={month.total} />
      <div className="order-status-month-summary">
        <span className="order-status-tag success">✓ Completed {month.completed}</span>
        <span className="order-status-tag warning">รอดำเนินการ {month.pending}</span>
        {month.cancelled > 0 && (
          <span className="order-status-tag danger">ยกเลิก {month.cancelled}</span>
        )}
        {month.deleted > 0 && (
          <span className="order-status-tag danger">ลบ {month.deleted}</span>
        )}
      </div>
    </div>
  );
}

export default function OrderStatusDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
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

  const yearTotal = data
    ? data.months.reduce((sum, m) => sum + m.total, 0)
    : 0;
  const yearCompleted = data
    ? data.months.reduce((sum, m) => sum + m.completed, 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Dashboard สถานะ Order"
        subtitle="ภาพรวมจำนวน Order แต่ละสถานะปัจจุบัน แยกตามเดือนที่สร้าง"
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

      <div className="order-status-legend">
        {SLICE_ORDER.map((key) => (
          <span className="order-status-legend-item" key={key}>
            <span
              className="order-status-legend-dot"
              style={{ background: SLICE_COLORS[key] }}
            />
            {key === "CANCELLED" ? "ยกเลิก" : key === "DELETED" ? "ถูกลบ" : key}
          </span>
        ))}
      </div>

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
              <small>ยังไม่มา (ทุกสถานะรอ)</small>
              <strong>{yearTotal - yearCompleted}</strong>
            </div>
          </div>

          <div className="order-status-month-grid">
            {data.months.map((m) => (
              <MonthCard month={m} key={m.month} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
