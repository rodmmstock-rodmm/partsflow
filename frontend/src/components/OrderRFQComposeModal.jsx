import { useMemo, useState } from "react";
import { apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";

export default function OrderRFQComposeModal({ orders, options, onClose, onOpened }) {
  const orderIds = useMemo(() => (orders || []).map((row) => row.id), [orders]);
  const [vendorId, setVendorId] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createDrafts(event) {
    event.preventDefault();
    setError("");
    if (!vendorId) {
      setError("กรุณาเลือก Vendor");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPost("/orders/rfq-drafts/", {
        order_ids: orderIds,
        vendor_id: vendorId,
      });
      const nextDrafts = result.drafts || [];
      if (!nextDrafts.length) throw new Error("Gmail ไม่ได้ส่งรายการ Draft กลับมา");
      setDrafts(nextDrafts);
      onOpened?.();
      if (nextDrafts.length === 1) window.open(nextDrafts[0].draft_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "สร้าง Gmail Draft ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function openDraft(draft) {
    if (draft?.draft_url) window.open(draft.draft_url, "_blank", "noopener,noreferrer");
  }

  return (
    <Modal title={`สร้างอีเมลขอราคา RFQ · ${orderIds.length} Order`} onClose={onClose} wide>
      <form onSubmit={createDrafts}>
        <Alert>{error}</Alert>
        {drafts.length > 0 ? (
          <>
            <div className="alert success">
              สร้าง Gmail Draft แล้ว พร้อมข้อความและตารางสินค้าแบบ Excel (ทุกช่องมีเส้นขอบ) ยังไม่ได้ส่งอีเมล
            </div>
            <div className="rfq-result-list">
              {drafts.map((draft, index) => (
                <section className="rfq-result" key={draft.group_key || index}>
                  <div>
                    <strong>{draft.subject}</strong>
                    <span>Order: {(draft.order_numbers || []).join(", ")}</span>
                    <span>To: {draft.to}</span>
                    {(draft.cc || []).length > 0 && <span>CC: {draft.cc.join(", ")}</span>}
                  </div>
                  <button type="button" className="mini primary" onClick={() => openDraft(draft)}>
                    เปิด Gmail Draft
                  </button>
                </section>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onClose}>เสร็จสิ้น</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>เลือก Vendor *</span>
              <SearchableSelect
                required
                value={vendorId}
                options={(options?.vendors || []).filter((vendor) => vendor.active !== false)}
                onChange={setVendorId}
                getLabel={(vendor) => vendor.name || ""}
                getSearchText={(vendor) => `${vendor.name || ""} ${vendor.email || ""}`}
                placeholder="ค้นหาชื่อ Vendor"
              />
            </label>
            <small className="field-help">
              ระบบจะสร้างอีเมลฉบับร่างใน Gmail พร้อมข้อความและตารางสินค้าโดยอัตโนมัติ คุณตรวจสอบก่อนกดส่งได้
            </small>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn primary" disabled={busy || !vendorId}>
                {busy ? "กำลังสร้าง Gmail Draft..." : "สร้าง Gmail Draft"}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
