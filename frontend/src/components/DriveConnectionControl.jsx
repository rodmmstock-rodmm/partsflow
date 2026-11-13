import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";

// OAuth preparation must use the authenticated API request. Opening the blank
// tab synchronously also avoids Safari/Chrome popup blockers after the await.
export default function DriveConnectionControl({ mobile = false, canManage = false }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiGet("/drive/oauth/status/", { cache: false });
      setStatus(result || {});
    } catch (err) {
      setError(err?.message || "ตรวจสอบสถานะ Google Drive ไม่สำเร็จ");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) refreshStatus();
  }, [canManage, refreshStatus]);

  async function connect() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await apiPost("/drive/oauth/prepare/");
      if (!result?.authorization_url) {
        throw new Error("Backend ไม่ได้ส่ง Google authorization URL กลับมา");
      }
      popup.location.href = result.authorization_url;
    } catch (err) {
      popup.close();
      setError(err?.message || "เริ่มเชื่อมต่อ Google Drive ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  const buttonClass = mobile ? "m-icon-action" : "btn ghost";
  const buttonStyle = mobile ? { minHeight: 36, padding: "7px 10px", whiteSpace: "nowrap" } : undefined;

  return (
    <div className={mobile ? "drive-connection-control mobile" : "drive-connection-control"} style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {loading ? (
        <span className="field-help">กำลังตรวจสอบ Google Drive...</span>
      ) : status?.connected ? (
        <>
          <span className="status success" role="status">Google Drive เชื่อมต่อแล้ว</span>
          <button type="button" className={buttonClass} style={buttonStyle} onClick={refreshStatus} disabled={busy}>ตรวจสอบอีกครั้ง</button>
        </>
      ) : status?.configured === false ? (
        <span className="field-help" role="status">{status.detail || "Google Drive ยังตั้งค่าไม่ครบใน Backend"}</span>
      ) : (
        <button type="button" className={buttonClass} style={buttonStyle} onClick={connect} disabled={busy || loading}>
          {busy ? "กำลังเปิด Google..." : "เชื่อมต่อ Google Drive"}
        </button>
      )}
      {error && <span className="field-help" role="alert">{error}</span>}
    </div>
  );
}
