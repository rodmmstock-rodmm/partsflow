import { useMemo, useState } from "react";
import { apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";

function gmailComposeUrl(group) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: group.to || "",
    cc: (group.cc || []).join(","),
    su: group.subject || "",
    body: group.body || "",
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export default function OrderRFQComposeModal({ orders, options, onClose, onOpened }) {
  const orderIds = useMemo(() => (orders || []).map((row) => row.id), [orders]);
  const [vendorId, setVendorId] = useState("");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createEmails(event) {
    event.preventDefault();
    setError("");
    if (!vendorId) {
      setError("กรุณาเลือก Vendor");
      return;
    }

    // Open synchronously from the user's click so the browser does not block
    // Gmail after the server validation request completes.
    const pendingTab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const result = await apiPost("/orders/rfq-compose/", {
        order_ids: orderIds,
        vendor_id: vendorId,
      });
      const nextGroups = result.groups || [];
      if (!nextGroups.length) throw new Error("ไม่พบกลุ่ม Order สำหรับสร้างอีเมล");
      setGroups(nextGroups);
      if (nextGroups.length === 1) {
        if (pendingTab) pendingTab.location.href = gmailComposeUrl(nextGroups[0]);
        else setError("เบราว์เซอร์บล็อกหน้าต่าง Gmail กรุณาอนุญาต Pop-up แล้วกดเปิด Gmail อีกครั้ง");
        onOpened?.();
      } else if (pendingTab) {
        pendingTab.close();
      }
    } catch (err) {
      if (pendingTab) pendingTab.close();
      setError(err.message || "สร้างอีเมล RFQ ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function openGroup(group) {
    const tab = window.open(gmailComposeUrl(group), "_blank");
    if (!tab) setError("เบราว์เซอร์บล็อกหน้าต่าง Gmail กรุณาอนุญาต Pop-up");
  }

  return (
    <Modal title={`สร้างอีเมลขอราคา RFQ · ${orderIds.length} Order`} onClose={onClose} wide>
      <form onSubmit={createEmails}>
        <Alert>{error}</Alert>
        {groups.length === 1 ? (
          <>
            <div className="alert success">เตรียมอีเมล RFQ แล้ว และเปิด Gmail ในแท็บใหม่</div>
            <section className="rfq-result">
              <div>
                <strong>{groups[0].subject}</strong>
                <span>Order: {(groups[0].order_numbers || []).join(", ")}</span>
                <span>To: {groups[0].to}</span>
                {(groups[0].cc || []).length > 0 && <span>CC: {groups[0].cc.join(", ")}</span>}
              </div>
              <button type="button" className="mini primary" onClick={() => openGroup(groups[0])}>เปิด Gmail อีกครั้ง</button>
            </section>
            <div className="modal-actions"><button type="button" className="btn primary" onClick={onClose}>เสร็จสิ้น</button></div>
          </>
        ) : groups.length > 1 ? (
          <>
            <div className="alert info">
              พบ {groups.length} กลุ่มอีเมล เนื่องจาก Machine Code, JOB หรือวันที่งานค้างแตกต่างกัน
              กรุณาเปิด Gmail ทีละฉบับ
            </div>
            <div className="rfq-result-list">
              {groups.map((group, index) => (
                <section className="rfq-result" key={group.group_key || index}>
                  <div>
                    <strong>{group.subject}</strong>
                    <span>Order: {(group.order_numbers || []).join(", ")}</span>
                    <span>To: {group.to}</span>
                    {(group.cc || []).length > 0 && <span>CC: {group.cc.join(", ")}</span>}
                  </div>
                  <button type="button" className="mini primary" onClick={() => openGroup(group)}>
                    เปิด Gmail
                  </button>
                </section>
              ))}
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
              To ใช้อีเมลหลักของ Vendor และ CC ใช้อีเมล Contact เพิ่มเติม
            </small>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn primary" disabled={busy || !vendorId}>
                {busy ? "กำลังเตรียมอีเมล..." : "สร้างอีเมลและเปิด Gmail"}
              </button>
            </div>
          </>
        )}
        {groups.length > 1 && (
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>ปิด</button>
          </div>
        )}
      </form>
    </Modal>
  );
}
