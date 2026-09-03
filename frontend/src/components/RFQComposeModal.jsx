import { useEffect, useMemo, useState } from "react";
import { apiPost } from "../api";
import { Alert, Modal, SearchableSelect, fmt } from "./Common";

function splitEmails(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, rows) => item && rows.indexOf(item) === index);
}

function vendorLabel(vendor) {
  return vendor ? `${vendor.code} · ${vendor.name}` : "";
}

function localDateTimeNow() {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function isHttpsLink(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export default function RFQComposeModal({ orders, options, onClose, onRecorded }) {
  const orderIds = useMemo(() => (orders || []).map((row) => row.id), [orders]);
  const [preview, setPreview] = useState(null);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sentAt, setSentAt] = useState(localDateTimeNow);
  const [emailLink, setEmailLink] = useState("");
  const [groupCc, setGroupCc] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    setBusy(true);
    apiPost("/rfqs/preview/", { order_ids: orderIds })
      .then((data) => {
        if (!active) return;
        setPreview(data);
        setGroupCc(
          Object.fromEntries(
            (data.groups || []).map((group) => [
              group.group_order,
              (group.cc_emails || []).join(", "),
            ])
          )
        );
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [orderIds.join("|")]);

  function chooseVendor(id) {
    const vendor = (options.vendors || []).find((item) => item.id === id);
    setVendorId(id);
    setVendorName(vendor?.name || "");
    if (vendor?.email) setRecipientEmail(vendor.email);
  }

  async function record(event) {
    event.preventDefault();
    setError("");
    if (!vendorId) {
      setError("กรุณาเลือก Vendor จาก Vendor Master");
      return;
    }
    if (!recipientEmail.trim()) {
      setError("กรุณาระบุอีเมล Vendor");
      return;
    }
    if (!isHttpsLink(emailLink.trim())) {
      setError("กรุณาวางลิงก์อีเมลที่ขึ้นต้นด้วย https://");
      return;
    }

    setBusy(true);
    try {
      const data = await apiPost("/rfqs/record/", {
        order_ids: orderIds,
        vendor_id: vendorId,
        vendor_name: vendorName.trim(),
        recipient_email: recipientEmail.trim(),
        sent_at: new Date(sentAt).toISOString(),
        email_link: emailLink.trim(),
        group_cc_emails: Object.fromEntries(
          Object.entries(groupCc).map(([key, value]) => [key, splitEmails(value)])
        ),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal title="บันทึกคำขอราคาสำเร็จ" onClose={onClose} wide>
        <Alert>{error}</Alert>
        <div className="alert success">
          บันทึกแล้ว {result.recorded_count || 0} RFQ โดยไม่มีการส่งอีเมลจาก PartsFlow
        </div>
        <div className="rfq-result-list">
          {(result.results || []).map((row) => (
            <section className="rfq-result sent" key={row.id}>
              <div>
                <strong>{row.rfq_number}</strong>
                <span>{row.group_order} · {row.vendor}</span>
                <span>{row.recipient_email}</span>
                {row.warning && <small className="text-danger">บันทึกสำเร็จ แต่มีคำเตือน: {row.warning}</small>}
              </div>
              {row.email_link && (
                <a className="mini link" href={row.email_link} target="_blank" rel="noreferrer">
                  เปิดอีเมล
                </a>
              )}
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn primary" type="button" onClick={() => onRecorded?.(result)}>
            เสร็จสิ้น
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`บันทึกคำขอราคา · ${orderIds.length} รายการ`} onClose={onClose} wide>
      <form onSubmit={record}>
        <Alert>{error}</Alert>
        {busy && !preview ? (
          <div className="empty">กำลังตรวจ Group Order และ JOB...</div>
        ) : preview ? (
          <>
            <div className="alert info">
              ส่งอีเมลจาก Gmail ด้วยตนเองก่อน แล้วนำลิงก์อีเมลที่ส่งมาบันทึกใน PartsFlow
              ระบบจะไม่ส่งหรืออ่านอีเมลของคุณ
            </div>
            {(preview.groups || []).length > 1 && (
              <div className="alert warning">
                รายการที่เลือกมีหลาย Group Order ระบบจะสร้าง RFQ แยกตาม Group โดยใช้ Vendor และลิงก์อีเมลเดียวกัน
              </div>
            )}
            <div className="form-grid">
              <label className="field">
                <span>Vendor *</span>
                <SearchableSelect
                  required
                  value={vendorId}
                  options={options.vendors || []}
                  onChange={chooseVendor}
                  getLabel={vendorLabel}
                  getSearchText={(vendor) => `${vendor.code || ""} ${vendor.name || ""} ${vendor.email || ""} ${vendor.contact_person || ""}`}
                  placeholder="พิมพ์ชื่อหรือรหัส Vendor"
                />
              </label>
              <label className="field">
                <span>อีเมล Vendor *</span>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="vendor@example.com"
                  required
                />
              </label>
              <label className="field">
                <span>วันที่และเวลาที่ส่ง *</span>
                <input
                  type="datetime-local"
                  value={sentAt}
                  onChange={(event) => setSentAt(event.target.value)}
                  required
                />
              </label>
              <label className="field span2">
                <span>ลิงก์อีเมลที่ส่ง *</span>
                <input
                  type="url"
                  value={emailLink}
                  onChange={(event) => setEmailLink(event.target.value)}
                  placeholder="https://mail.google.com/..."
                  required
                />
                <small className="field-help">เปิดอีเมลที่ส่งแล้วคัดลอก URL จาก Gmail มาวางที่นี่</small>
              </label>
            </div>

            <div className="rfq-group-list">
              {(preview.groups || []).map((group) => (
                <section className="rfq-group-card" key={group.group_order}>
                  <header>
                    <div>
                      <strong>Group Order: {group.group_order}</strong>
                      <span>JOB {group.job} · {group.items.length} รายการ</span>
                    </div>
                  </header>
                  <label className="field">
                    <span>CC ที่ใช้ในอีเมลนี้ (แก้ไขหรือลบได้)</span>
                    <textarea
                      rows="2"
                      value={groupCc[group.group_order] || ""}
                      onChange={(event) =>
                        setGroupCc((current) => ({
                          ...current,
                          [group.group_order]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="table-wrap compact">
                    <table>
                      <thead>
                        <tr>
                          <th>Part ID</th><th>Part Name</th><th>Part Detail</th><th>จำนวน</th><th>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.order_id}>
                            <td><b>{item.item_id || "-"}</b></td>
                            <td>{item.part_name}</td>
                            <td>{item.part_detail || "-"}</td>
                            <td>{fmt(item.amount)}</td>
                            <td>{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy || !preview}>
            {busy ? "กำลังบันทึก..." : "บันทึกคำขอราคา"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
