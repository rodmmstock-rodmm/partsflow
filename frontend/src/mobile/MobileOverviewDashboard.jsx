import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { useFeedback } from "../feedback";
import { MobilePage } from "./MobileCommon";
import { fmt } from "../components/Common";
import MonthlySpendCard from "../components/MonthlySpendCard";
import DailyWithdrawalChart from "../components/DailyWithdrawalChart";

function MobileKpiIcon({ type }) {
  const shapes = {
    parts: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v9" /></>,
    safety: <><path d="m12 3 9 16H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    orders: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  };
  return <span className={`overview-icon overview-icon-${type}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[type]}</svg></span>;
}

export default function MobileOverviewDashboard() {
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
    <MobilePage title="Overview" subtitle="ภาพรวมสถานะคลังอะไหล่">
      <MonthlySpendCard amount={kpi.monthly_purchase_spend} />
      <DailyWithdrawalChart />
      <section className="dashboard-overview-mobile-links">
        <h2>ทางลัด</h2>
        <button type="button" onClick={() => navigate("/stock")}><span><b>จัดการ Stock</b><small>ค้นหา แก้ไข เบิก รับเข้า และปรับยอด</small></span><strong>›</strong></button>
        <button type="button" onClick={() => navigate("/history")}><span><b>ประวัติรับเข้า–เบิกจ่าย</b><small>ตรวจสอบรายการย้อนหลัง</small></span><strong>›</strong></button>
        <button type="button" onClick={() => navigate("/safety-stock")}><span><b>Safety Stock</b><small>ติดตามรายการที่ต่ำกว่าจุดสั่งซื้อ</small></span><strong>›</strong></button>
        <button type="button" onClick={() => navigate("/orders")}><span><b>Order</b><small>ติดตามงานสั่งซื้อ</small></span><strong>›</strong></button>
      </section>
    </MobilePage>
  );
}
