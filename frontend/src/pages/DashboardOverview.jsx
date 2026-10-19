import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { PageHeader, fmt } from "../components/Common";
import { useFeedback } from "../feedback";
import MonthlySpendCard from "../components/MonthlySpendCard";

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
      <div className="kpi-grid four dashboard-overview-kpi">
        <MonthlySpendCard amount={kpi.monthly_purchase_spend} showToast={showToast} />
        <button type="button" className="kpi-card kpi-card-link overview-kpi-card" onClick={() => navigate("/stock")}>
          <span>จำนวนรายการอะไหล่</span>
          <strong>{fmt(kpi.parts)}</strong>
          <small>ดูและจัดการรายการสินค้าในคลัง</small>
        </button>
        <button type="button" className="kpi-card danger kpi-card-link overview-kpi-card" onClick={() => navigate("/safety-stock")}>
          <span>Safety Stock</span>
          <strong>{fmt(kpi.safety_stock)}</strong>
          <small>ต่ำกว่า Min และยังไม่ได้สั่ง</small>
        </button>
        <button type="button" className="kpi-card warning kpi-card-link overview-kpi-card" onClick={() => navigate("/orders")}>
          <span>Safety Stock currently Order</span>
          <strong>{fmt(kpi.safety_stock_ordered)}</strong>
          <small>ต่ำกว่า Min แต่มี Order อยู่</small>
        </button>
      </div>

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
