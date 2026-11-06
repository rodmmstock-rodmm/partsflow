import { useState } from "react";
import { apiDownload } from "../api";
import { useFeedback } from "../feedback";

const BACKUP_PATHS = {
  stock: ["/backup/stock.xlsx", "partsflow_stock_backup.xlsx"],
  tooling: ["/backup/tooling.xlsx", "partsflow_tooling_backup.xlsx"],
  gauge: ["/backup/gauge-control.xlsx", "partsflow_gauge_control_backup.xlsx"],
};

export default function BackupDownloadButton({ type, mobile = false }) {
  const [busy, setBusy] = useState(false);
  const { showToast } = useFeedback();
  const config = BACKUP_PATHS[type];

  if (!config) return null;

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      await apiDownload(config[0], config[1]);
      showToast("ดาวน์โหลดไฟล์ Backup สำเร็จ", "success");
    } catch (error) {
      showToast(error.message || "ดาวน์โหลดไฟล์ Backup ไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={mobile ? "m-icon-action backup-download-btn" : "btn ghost backup-download-btn"}
      onClick={download}
      disabled={busy}
      title="ดาวน์โหลดข้อมูล Backup เป็น Excel"
    >
      {busy ? "กำลังเตรียมไฟล์..." : "⬇ Backup Excel"}
    </button>
  );
}
