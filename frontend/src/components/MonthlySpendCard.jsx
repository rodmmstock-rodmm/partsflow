import { useState } from "react";

function money(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export default function MonthlySpendCard({ amount, showToast }) {
  const monthKey = `partsflow-monthly-budget-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [budget, setBudget] = useState(() => {
    try { return Number(window.localStorage.getItem(monthKey) || 0); } catch { return 0; }
  });
  const [draft, setDraft] = useState(() => {
    try { return window.localStorage.getItem(monthKey) || ""; } catch { return ""; }
  });
  const spend = Number(amount || 0);
  const percent = budget > 0 ? Math.round((spend / budget) * 100) : 0;

  function save(event) {
    event.preventDefault();
    const next = Math.max(0, Number(draft || 0));
    try {
      window.localStorage.setItem(monthKey, String(next));
      setBudget(next);
      showToast("บันทึกงบประมาณประจำเดือนแล้ว", "success");
    } catch {
      showToast("บันทึกงบประมาณในอุปกรณ์นี้ไม่สำเร็จ", "error");
    }
  }

  return (
    <section className="budget-kpi-card dashboard-budget-card" aria-label="งบประมาณสั่งซื้อประจำเดือน">
      <div className="budget-kpi-top">
        <div><span className="budget-kpi-label">ยอดสั่งซื้อเดือนนี้</span><strong className="budget-kpi-amount">฿{money(spend)}</strong></div>
        <span className="budget-kpi-icon" aria-hidden="true">฿</span>
      </div>
      <div className="budget-kpi-meta">
        <span>งบประมาณต่อเดือน</span>
        <form className="budget-kpi-form" onSubmit={save}>
          <span>฿</span>
          <input aria-label="งบประมาณต่อเดือน (บาท)" type="number" min="0" step="0.01" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="ระบุงบประมาณ" />
          <button type="submit">บันทึก</button>
        </form>
      </div>
      <div className="budget-kpi-progress-track" role="progressbar" aria-label="สัดส่วนงบประมาณที่ใช้ไป" aria-valuemin="0" aria-valuemax="100" aria-valuenow={budget > 0 ? Math.min(100, percent) : 0}>
        <span style={{ width: `${budget > 0 ? Math.min(100, (spend / budget) * 100) : 0}%` }} />
      </div>
      <div className="budget-kpi-footer">
        <span>{budget > 0 ? `${percent}% ของงบประมาณ` : "กรอกงบประมาณเพื่อดูเปอร์เซ็นต์"}</span>
        <span>{budget > 0 ? `งบคงเหลือ ฿${money(budget - spend)}` : "หน่วย: บาท"}</span>
      </div>
      {spend > budget && budget > 0 && <small className="budget-kpi-over">ใช้เกินงบประมาณ ฿{money(spend - budget)}</small>}
    </section>
  );
}
