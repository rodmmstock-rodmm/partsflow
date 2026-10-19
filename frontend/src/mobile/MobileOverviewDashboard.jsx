import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { useFeedback } from "../feedback";
import { MobilePage } from "./MobileCommon";
import { fmt } from "../components/Common";
import MonthlySpendCard from "../components/MonthlySpendCard";

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
      <MonthlySpendCard amount={kpi.monthly_purchase_spend} showToast={showToast} />
      <div className="m-kpi-row dashboard-overview-kpi-mobile">
        <button type="button" onClick={() => navigate("/stock")}>
          <span>รายการอะไหล่</span><b>{fmt(kpi.parts)}</b>
        </button>
        <button type="button" className="danger" onClick={() => navigate("/safety-stock")}>
          <span>ต่ำกว่า Min</span><b>{fmt(kpi.safety_stock)}</b>
        </button>
        <button type="button" className="warning" onClick={() => navigate("/orders")}>
          <span>กำลัง Order</span><b>{fmt(kpi.safety_stock_ordered)}</b>
        </button>
      </div>
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
