import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { PageHeader, fmt } from "../components/Common";
import { useFeedback } from "../feedback";
import MonthlySpendCard from "../components/MonthlySpendCard";
import DailyWithdrawalChart from "../components/DailyWithdrawalChart";

function OverviewIcon({ type }) {
  const shapes = {
    parts: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v9" /></>,
    safety: <><path d="m12 3 9 16H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    orders: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  };
  return <span className={`overview-icon overview-icon-${type}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[type]}</svg></span>;
}

export default function DashboardOverview() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { showToast } = useFeedback();
  const [kpi, setKpi] = useState({});

  useEffect(() => {
    let active = true;
    apiGet("/dashboard/")
      .then((data) => { if (active) setKpi(data.kpi || {}); })
      .catch((err) => { if (active) showToast(err.message, "error"); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <PageHeader title="Overview" subtitle="ภาพรวมสถานะคลังอะไหล่และงานที่ควรติดตาม" />
      <MonthlySpendCard amount={kpi.monthly_purchase_spend} />
      <DailyWithdrawalChart />

      <section className="panel dashboard-overview-actions">
        <div className="section-head">
          <h2>ทางลัด</h2>
          <p>ไปยังงานที่ใช้บ่อยได้โดยตรง</p>
        </div>
        <div className="dashboard-overview-links">
          <button type="button" className="btn primary" onClick={() => navigate("/stock")}>จัดการ Stock</button>
          <button type="button" className="btn" onClick={() => navigate("/history")}>ประวัติรับเข้า–เบิกจ่าย</button>
          <button type="button" className="btn" onClick={() => navigate("/safety-stock")}>ตรวจสอบ Safety Stock</button>
          {auth.can("can_view_orders") && <button type="button" className="btn" onClick={() => navigate("/orders")}>ดูรายการ Order</button>}
          {auth.can("can_view_dashboard") && <button type="button" className="btn" onClick={() => navigate("/spare-sets")}>ชุดอะไหล่เครื่องจักร</button>}
        </div>
      </section>
    </>
  );
}
