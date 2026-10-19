function money(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export default function MonthlySpendCard({ amount }) {
  const spend = Number(amount || 0);
  return (
    <section className="budget-kpi-card dashboard-budget-card overview-kpi-card" aria-label="ยอดสั่งซื้อของเดือนนี้">
      <div className="budget-kpi-top">
        <div>
          <span className="budget-kpi-label">ยอดสั่งซื้อของเดือนนี้</span>
          <strong className="budget-kpi-amount">฿{money(spend)}</strong>
          <small className="overview-kpi-caption">ยอดรวมรายการสั่งซื้อในเดือนปัจจุบัน</small>
        </div>
        <span className="budget-kpi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>
        </span>
      </div>
    </section>
  );
}
