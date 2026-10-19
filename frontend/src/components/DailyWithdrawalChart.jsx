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
  };
  return <span className="overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.chart}</svg></span>;
}

async function loadAllPages(path) {
  const first = await apiGet(path);
  const rows = [...(first.results || [])];
  const totalPages = Number(first.total_pages || 1);
  if (totalPages > 1) {
    const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => {
      const url = new URL(path, window.location.origin);
      url.searchParams.set("page", String(i + 2));
      return apiGet(url.pathname + url.search).then((data) => data.results || []);
    }));
    rest.forEach((pageRows) => rows.push(...pageRows));
  }
  return rows;
}

function makeLine(values, width, height, pad = 8) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: pad + index * step,
    y: height - pad - ((value || 0) / max) * (height - pad * 2),
  }));
}

function MiniTrend({ values, label, color, formatter, unit }) {
  const points = makeLine(values, 560, 112, 8);
  const line = points.map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L 552 104 L 8 104 Z`;
  const max = Math.max(0, ...values);
  const peakDay = values.indexOf(max) + 1;
  return (
    <div className="withdrawal-trend">
      <div className="withdrawal-trend-head">
        <span><i style={{ background: color }} />{label}</span>
        <b>{formatter(max)}{unit ? ` ${unit}` : ""}<small>{max ? ` · สูงสุดวันที่ ${peakDay}` : " · ยังไม่มีข้อมูล"}</small></b>
      </div>
      <svg className="withdrawal-chart-svg" viewBox="0 0 560 112" role="img" aria-label={label}>
        {[28, 52, 76, 100].map((y) => <line key={y} x1="8" x2="552" y1={y} y2={y} className="withdrawal-grid-line" />)}
        <path d={area} fill={color} opacity=".10" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {points.filter((_, i) => i === 0 || i === points.length - 1 || (i + 1) % 5 === 0).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.1" fill="#fff" stroke={color} strokeWidth="2" />)}
      </svg>
      <div className="withdrawal-day-labels"><span>วันที่ 1</span><span>วันที่ {Math.ceil(values.length / 2)}</span><span>วันที่ {values.length}</span></div>
    </div>
  );
}

export default function DailyWithdrawalChart() {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth());
  const [rows, setRows] = useState([]);
  const [priceBySku, setPriceBySku] = useState({});
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
        const [history, activeParts, inactiveParts] = await Promise.all([
          loadAllPages(`/history/?type=OUT&date_from=${from}&date_to=${to}&page_size=100`),
          loadAllPages("/parts/?active=true&page_size=100"),
          loadAllPages("/parts/?active=false&page_size=100"),
        ]);
        const priceMap = {};
        [...activeParts, ...inactiveParts].forEach((part) => {
          priceMap[String(part.sku || "").trim()] = Number(part.last_purchase_price || 0);
        });
        if (alive) {
          setRows(history);
          setPriceBySku(priceMap);
        }
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
    const result = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, quantity: 0, amount: 0 }));
    rows.forEach((row) => {
      const match = String(row.date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const day = match ? Number(match[1]) : Number(String(row.transaction_date || "").slice(8, 10));
      if (!day || day > daysInMonth || !result[day - 1]) return;
      const qty = Math.abs(Number(row.quantity || 0));
      result[day - 1].quantity += qty;
      result[day - 1].amount += qty * Number(priceBySku[String(row.item_id || "").trim()] || 0);
    });
    return result;
  }, [rows, priceBySku, daysInMonth]);

  const totalQty = daily.reduce((sum, day) => sum + day.quantity, 0);
  const totalAmount = daily.reduce((sum, day) => sum + day.amount, 0);

  return (
    <section className="panel withdrawal-chart-card" aria-label="กราฟสรุปการเบิกจ่ายรายวัน">
      <div className="withdrawal-chart-header">
        <div>
          <div className="withdrawal-chart-kicker"><Icon name="calendar" />{TH_MONTHS[month]} {year}</div>
          <h2>สรุปการเบิกจ่ายรายวัน</h2>
          <p>จำนวนที่เบิกและมูลค่าประเมิน แยกตามวัน</p>
        </div>
        <Icon name="chart" />
      </div>
      <div className="withdrawal-chart-totals">
        <div><span>จำนวนที่เบิกเดือนนี้</span><strong>{loading ? "—" : money(totalQty)}</strong><small>หน่วยรวมตามรายการเบิก</small></div>
        <div><span>มูลค่ารวมที่เบิก</span><strong>฿{loading ? "—" : money(totalAmount)}</strong><small>คำนวณจากราคาซื้อล่าสุดของอะไหล่</small></div>
      </div>
      {loading ? <div className="withdrawal-chart-state">กำลังโหลดข้อมูลการเบิก...</div> : error ? <div className="withdrawal-chart-state error">{error} — ตรวจสอบสิทธิ์การดู History และ Stock</div> : rows.length === 0 ? <div className="withdrawal-chart-state">ยังไม่มีรายการเบิกในเดือนนี้</div> : (
        <div className="withdrawal-chart-body">
          <MiniTrend values={daily.map((day) => day.quantity)} label="จำนวนที่เบิกต่อวัน" color="#3285d6" formatter={money} unit="หน่วย" />
          <MiniTrend values={daily.map((day) => day.amount)} label="มูลค่าที่เบิกต่อวัน" color="#76aee8" formatter={(value) => `฿${money(value)}`} />
        </div>
      )}
      <div className="withdrawal-chart-footnote">* มูลค่าเป็นการประเมินจากราคาซื้อล่าสุดที่บันทึกใน Stock ไม่ใช่ราคาต้นทุน ณ วันที่เบิก</div>
    </section>
  );
}
