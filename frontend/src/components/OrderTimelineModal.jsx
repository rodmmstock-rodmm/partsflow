import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Alert, Modal, formatDMY } from "./Common";

const STAGE_COLOR = {
  "New Order": "info",
  "Wait Quotation": "info",
  "Wait Issue P/R": "info",
  "Wait for Item": "info",
  "Wait Confirm": "warning",
  "Complete Order": "success",
  CANCELLED: "danger",
  DELETED: "danger",
};

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

export default function OrderTimelineModal({ orderId, orderNumber, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiGet(`/orders/${orderId}/timeline/`)
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderId]);

  return (
    <Modal title={`Timeline · ${orderNumber || data?.order_number || ""}`} onClose={onClose}>
      <Alert>{error}</Alert>
      {loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : data ? (
        <div className="order-timeline">
          <div className="order-timeline-summary">
            <div>
              <small>สถานะปัจจุบัน</small>
              <span className={`status ${STAGE_COLOR[data.current_stage] || "info"}`}>
                {data.current_stage_label}
              </span>
            </div>
            <div>
              <small>{data.is_final ? "ใช้เวลารวมทั้งหมด" : "ผ่านมาแล้ว"}</small>
              <strong>{formatDuration(data.total_seconds)}</strong>
            </div>
          </div>

          {!data.has_full_history && (
            <div className="order-timeline-warning">
              ⚠️ Order นี้สร้างก่อนระบบเริ่มเก็บประวัติการเปลี่ยนสถานะ (Audit Log) —
              ช่วง "{data.segments[0]?.stage_label}" ด้านล่างเป็นการประมาณจากวันที่สร้าง
              Order เท่านั้น อาจไม่ตรงกับความเป็นจริงทั้งหมด
            </div>
          )}

          <div className="order-timeline-list">
            {data.segments.map((seg, i) => (
              <div className="order-timeline-item" key={i}>
                <div className={`order-timeline-dot ${STAGE_COLOR[seg.stage] || "info"}`} />
                <div className="order-timeline-body">
                  <div className="order-timeline-head">
                    <b>{seg.stage_label}</b>
                    {seg.is_current && (
                      <span className="order-timeline-current-tag">กำลังดำเนินอยู่</span>
                    )}
                  </div>
                  <div className="order-timeline-range">
                    {formatDMY(seg.started_at, true)}
                    {" → "}
                    {seg.ended_at ? formatDMY(seg.ended_at, true) : "ตอนนี้"}
                  </div>
                  <div className="order-timeline-duration">{formatDuration(seg.duration_seconds)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
