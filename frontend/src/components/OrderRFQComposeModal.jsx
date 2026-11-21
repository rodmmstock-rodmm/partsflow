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
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function emailClipboardContent(group) {
  const intro = String(group.email_intro || group.message || "");
  const introHtml = intro
    ? intro.split("\n").map((line) => line
      ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`
      : "<br>").join("")
    : "";
  const introText = intro ? `${intro.replace(/\s+$/, "")}\n\n` : "";
  return {
    html: `${introHtml}${group.table_html || ""}`,
    text: `${introText}${group.table_text || ""}`,
  };
}

async function copyTableAndOpenGroup(group, onError, onCopied) {
  const pendingTab = window.open("about:blank", "_blank");
  try {
    if (!group.table_html) throw new Error("ไม่พบตาราง HTML สำหรับคัดลอก");
    const clipboardContent = emailClipboardContent(group);

    let copied = false;
    if (navigator.clipboard?.write && window.ClipboardItem) {
      try {
        const item = new window.ClipboardItem({
          "text/html": new Blob([clipboardContent.html], { type: "text/html" }),
          "text/plain": new Blob([clipboardContent.text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        copied = true;
      } catch {
        // Rich clipboard permissions vary by browser; use the editable selection fallback.
      }
    }

    if (!copied) {
      const holder = document.createElement("div");
      holder.contentEditable = "true";
      holder.setAttribute("aria-hidden", "true");
      holder.style.position = "fixed";
      holder.style.left = "0";
      holder.style.top = "0";
      holder.style.width = "1px";
      holder.style.height = "1px";
      holder.style.opacity = "0.01";
      holder.style.overflow = "hidden";
      holder.style.pointerEvents = "none";
      holder.innerHTML = clipboardContent.html;
      document.body.appendChild(holder);

      const selection = window.getSelection();
      const previousRanges = [];
      for (let index = 0; selection && index < selection.rangeCount; index += 1) {
        previousRanges.push(selection.getRangeAt(index).cloneRange());
      }
      const range = document.createRange();
      range.selectNodeContents(holder);
      selection?.removeAllRanges();
      selection?.addRange(range);
      holder.focus();
      copied = document.execCommand("copy");
      selection?.removeAllRanges();
      previousRanges.forEach((previousRange) => selection?.addRange(previousRange));
      holder.remove();
    }

    if (!copied) throw new Error("เบราว์เซอร์ไม่อนุญาตให้คัดลอกข้อความและตาราง");
    if (!pendingTab) throw new Error("เบราว์เซอร์บล็อกหน้าต่าง Gmail กรุณาอนุญาต Pop-up");
    pendingTab.location.href = gmailComposeUrl(group);
    onCopied?.(group.group_key || group.subject);
  } catch (err) {
    if (pendingTab) pendingTab.close();
    onError(err.message || "คัดลอกตารางไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
}

export default function OrderRFQComposeModal({ orders, options, onClose, onOpened, emailType = "RFQ" }) {
  const orderIds = useMemo(() => (orders || []).map((row) => row.id), [orders]);
  const emailLabels = { RFQ: "ขอราคา", PRICE_UPDATE: "อัปเดตราคา", DELIVERY_DATE: "ตามวันที่จัดส่ง" };
  const emailLabel = emailLabels[emailType] || emailLabels.RFQ;
  const [vendorId, setVendorId] = useState("");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState("");

  async function createEmails(event) {
    event.preventDefault();
    setError("");
    if (!vendorId) {
      setError("กรุณาเลือก Vendor");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPost("/orders/rfq-compose/", {
        order_ids: orderIds,
        vendor_id: vendorId,
        subject_topic: emailType,
      });
      const nextGroups = result.groups || [];
      if (!nextGroups.length) throw new Error("ไม่พบกลุ่ม Order สำหรับสร้างอีเมล");
      setGroups(nextGroups);
      onOpened?.();
    } catch (err) {
      setError(err.message || "เตรียมอีเมลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function openGroup(group) {
    copyTableAndOpenGroup(group, setError, (key) => {
      setError("");
      setCopiedGroup(key);
    });
  }

  return (
    <Modal title={`สร้างอีเมล${emailLabel} · ${orderIds.length} Order`} onClose={onClose} wide>
      <form onSubmit={createEmails}>
        <Alert>{error}</Alert>
        {groups.length === 1 ? (
          <>
            <div className="alert success">
              เตรียมข้อความและตารางแล้ว กดปุ่มด้านล่างเพื่อเปิด Gmail จากนั้นวางเนื้อหาในอีเมล โดย Signature จะถูกแทรกจากการตั้งค่า Gmail
            </div>
            <section className="rfq-result">
              <div>
                <strong>{groups[0].subject}</strong>
                <span>Order: {(groups[0].order_numbers || []).join(", ")}</span>
                <span>To: {groups[0].to}</span>
                {(groups[0].cc || []).length > 0 && <span>CC: {groups[0].cc.join(", ")}</span>}
              </div>
              <button type="button" className="mini primary" onClick={() => openGroup(groups[0])}>
                คัดลอกข้อความและตาราง เปิด Gmail
              </button>
            </section>
            {copiedGroup && (
              <div className="alert success">
                คัดลอกข้อความและตารางแล้ว ให้วางใน Gmail ด้วย Paste (Ctrl+V หรือ Command+V) โดย Signature จะอยู่ด้านล่าง
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onClose}>เสร็จสิ้น</button>
            </div>
          </>
        ) : groups.length > 1 ? (
          <>
            <div className="alert success">เตรียมอีเมลแล้ว แยกตามกลุ่มข้อมูล กรุณาคัดลอกข้อความและตาราง แล้วเปิด Gmail ทีละฉบับ</div>
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
                    คัดลอกข้อความและตาราง เปิด Gmail
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
              To ใช้อีเมลหลักของ Vendor และ CC ใช้อีเมล Contact เพิ่มเติม
            </small>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn primary" disabled={busy || !vendorId}>
                {busy ? "กำลังเตรียมอีเมล..." : `เตรียมอีเมล${emailLabel}`}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
