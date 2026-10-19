import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function money(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function Icon({ name }) {
  const paths = {
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v9" /></>,
  };
  return <span className="overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.chart}</svg></span>;
}

function smoothLine(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function MiniTrend({ values, label, color, formatter, unit, id }) {
  const width = 560;
  const height = 150;
  const padX = 10;
  const padY = 16;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: padX + index * ((width - padX * 2) / Math.max(1, values.length - 1)),
    y: height - padY - ((value || 0) / max) * (height - padY * 2),
  }));
  const line = smoothLine(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z` : "";
  const peakDay = values.indexOf(Math.max(0, ...values)) + 1;
  const hasValue = values.some((value) => value > 0);

  return (
    <div className="withdrawal-trend">
      <div className="withdrawal-trend-head">
        <span className="withdrawal-trend-label"><i style={{ background: color }} />{label}</span>
        <div className="withdrawal-trend-stat">
          <strong>{formatter(Math.max(0, ...values))}{unit ? ` ${unit}` : ""}</strong>
          <small>{hasValue ? `สูงสุดวันที่ ${peakDay}` : "ยังไม่มีข้อมูล"}</small>
        </div>
      </div>
      <svg className="withdrawal-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`withdrawal-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".22" />
            <stop offset="100%" stopColor={color} stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[34, 66, 98, 130].map((y) => <line key={y} x1="8" x2="552" y1={y} y2={y} className="withdrawal-grid-line" />)}
        {hasValue && <path d={area} fill={`url(#withdrawal-fill-${id})`} />}
        <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {hasValue && points.filter((_, index) => index === values.indexOf(Math.max(...values)) || index === values.length - 1).map((point, index) => (
          <g key={`${point.x}-${index}`}>
            <circle cx={point.x} cy={point.y} r="6" fill={color} opacity=".13" />
            <circle cx={point.x} cy={point.y} r="3.5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </g>
        ))}
      </svg>
      <div className="withdrawal-day-labels"><span>วันที่ 1</span><span>วันที่ {Math.ceil(values.length / 2)}</span><span>วันที่ {values.length}</span></div>
    </div>
  );
}

export default function DailyWithdrawalChart() {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth());
  const [dailyRows, setDailyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiGet(`/history/withdrawal-summary/?date_from=${from}&date_to=${to}`);
        if (alive) setDailyRows(data.results || []);
      } catch (err) {
        if (alive) setError(err.message || "โหลดข้อมูลกราฟไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [from, to]);

  const daily = useMemo(() => {
    const result = Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, quantity: 0, amount: 0 }));
    dailyRows.forEach((row) => {
      const day = Number(row.day);
      if (!day || !result[day - 1]) return;
      result[day - 1].quantity = Number(row.quantity || 0);
      result[day - 1].amount = Number(row.amount || 0);
    });
    return result;
  }, [dailyRows, daysInMonth]);

  const totalQty = daily.reduce((sum, day) => sum + day.quantity, 0);
  const totalAmount = daily.reduce((sum, day) => sum + day.amount, 0);
  const hasRows = daily.some((day) => day.quantity > 0);

  return (
    <section className="panel withdrawal-chart-card" aria-label="กราฟสรุปการเบิกจ่ายรายวัน">
      <div className="withdrawal-chart-header">
        <div className="withdrawal-chart-title-group">
          <div className="withdrawal-chart-kicker"><Icon name="calendar" />{TH_MONTHS[month]} {year}</div>
          <h2>สรุปการเบิกจ่าย</h2>
          <p>ภาพรวมจำนวนและมูลค่าการเบิก แยกตามวัน</p>
        </div>
        <div className="withdrawal-chart-header-icon"><Icon name="chart" /></div>
      </div>

      <div className="withdrawal-chart-totals">
        <div className="withdrawal-total-card quantity">
          <span><Icon name="box" /> จำนวนที่เบิกเดือนนี้</span>
          <strong>{loading ? "—" : money(totalQty)}</strong>
          <small>หน่วยรวมตามรายการเบิก</small>
        </div>
        <div className="withdrawal-total-card amount">
          <span><i>฿</i> มูลค่าประเมินที่เบิก</span>
          <strong>{loading ? "—" : `฿${money(totalAmount)}`}</strong>
          <small>อิงราคาซื้อล่าสุดที่บันทึกใน Stock</small>
        </div>
      </div>

      {loading ? (
        <div className="withdrawal-chart-loading" aria-live="polite">
          <span className="withdrawal-loading-line" /><span className="withdrawal-loading-line short" />
          <span className="withdrawal-loading-chart" />
          <small>กำลังโหลดสรุปการเบิกจ่าย…</small>
        </div>
      ) : error ? (
        <div className="withdrawal-chart-state error">{error}<small>ตรวจสอบสิทธิ์การดู History แล้วลองอีกครั้ง</small></div>
      ) : !hasRows ? (
        <div className="withdrawal-chart-state"><span className="withdrawal-empty-mark"><Icon name="chart" /></span><strong>ยังไม่มีรายการเบิกในเดือนนี้</strong><small>กราฟจะแสดงเมื่อมีรายการเบิกใหม่</small></div>
      ) : (
        <div className="withdrawal-chart-body">
          <MiniTrend id="quantity" values={daily.map((day) => day.quantity)} label="จำนวนที่เบิกต่อวัน" color="#398be2" formatter={money} unit="หน่วย" />
          <MiniTrend id="amount" values={daily.map((day) => day.amount)} label="มูลค่าที่เบิกต่อวัน" color="#68b7e8" formatter={(value) => `฿${money(value)}`} />
        </div>
      )}
      <div className="withdrawal-chart-footnote">* มูลค่าเป็นการประเมินจากราคาซื้อล่าสุด ไม่ใช่ราคาต้นทุน ณ วันที่เบิก</div>
    </section>
  );
}
