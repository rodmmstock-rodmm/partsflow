import { useEffect, useMemo, useState } from "react";
import { apiPatch, apiPost, apiUpload } from "../api";
import { Alert, Modal, fmt } from "./Common";

function splitEmails(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, rows) => item && rows.indexOf(item) === index);
}

function vendorLabel(vendor) {
  return vendor ? `${vendor.code} · ${vendor.name}` : "";
}

export default function RFQComposeModal({ orders, options, onClose, onSent }) {
  const orderIds = useMemo(() => (orders || []).map((row) => row.id), [orders]);
  const [preview, setPreview] = useState(null);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [groupCc, setGroupCc] = useState({});
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [sendResult, setSendResult] = useState(null);
  const [vendorForms, setVendorForms] = useState({});
  const [vendorBusy, setVendorBusy] = useState("");

  useEffect(() => {
    let active = true;
    setBusy(true);
    apiPost("/rfqs/preview/", { order_ids: orderIds })
      .then((data) => {
        if (!active) return;
        setPreview(data);
        setSubject(data.subject_template || "");
        setBody(data.body_text || "");
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

  async function send(event) {
    event.preventDefault();
    setError("");
    const emailRows = splitEmails(recipients);
    if (!emailRows.length) {
      setError("กรุณาระบุอีเมล Vendor อย่างน้อย 1 รายการ");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("order_ids", JSON.stringify(orderIds));
      form.append("recipients", JSON.stringify(emailRows));
      form.append(
        "group_cc_emails",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(groupCc).map(([key, value]) => [key, splitEmails(value)])
          )
        )
      );
      form.append("subject", subject);
      form.append("body_text", body);
      files.forEach((file) => form.append("attachments", file));
      const result = await apiUpload("/rfqs/send/", form);
      setSendResult(result);
      const nextForms = {};
      for (const row of result.results || []) {
        if (!row.success) continue;
        nextForms[row.id] = {
          vendor_id: row.vendor_id || "",
          vendor_name: row.vendor || "",
        };
      }
      setVendorForms(nextForms);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function setVendorForm(id, patch) {
    setVendorForms((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), ...patch },
    }));
  }

  async function saveVendor(row) {
    const form = vendorForms[row.id] || {};
    if (!form.vendor_id && !String(form.vendor_name || "").trim()) {
      setError(`กรุณาเลือกหรือระบุ Vendor สำหรับ ${row.recipient_email}`);
      return;
    }
    setVendorBusy(row.id);
    setError("");
    try {
      const updated = await apiPatch(`/rfqs/${row.id}/vendor/`, form);
      setSendResult((current) => ({
        ...current,
        results: (current.results || []).map((item) =>
          item.id === row.id ? { ...item, ...updated, success: true } : item
        ),
      }));
      setVendorForm(row.id, {
        vendor_id: updated.vendor_id || "",
        vendor_name: updated.vendor || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setVendorBusy("");
    }
  }

  const sentRows = (sendResult?.results || []).filter((row) => row.success);
  const pendingVendors = sentRows.filter((row) => row.vendor_pending).length;

  function closeResult() {
    if (
      pendingVendors > 0 &&
      !window.confirm(
        `ยังไม่ได้บันทึกชื่อ Vendor ${pendingVendors} รายการ ต้องการปิดหน้าต่างนี้หรือไม่?`
      )
    ) return;
    onClose();
  }

  if (sendResult) {
    return (
      <Modal title="ผลการส่งคำขอราคา" onClose={closeResult} wide>
        <Alert>{error}</Alert>
        <div className={`alert ${sendResult.failed_count ? "warning" : "success"}`}>
          ส่งสำเร็จ {sendResult.sent_count || 0} อีเมล
          {sendResult.failed_count ? ` · ไม่สำเร็จ ${sendResult.failed_count} อีเมล` : ""}
        </div>

        <div className="rfq-result-list">
          {(sendResult.results || []).map((row, index) => (
            <section className={`rfq-result ${row.success ? "sent" : "failed"}`} key={row.id || index}>
              <div>
                <strong>{row.rfq_number}</strong>
                <span>{row.recipient_email}</span>
                {!row.success && <small>{row.detail || "ส่งไม่สำเร็จ"}</small>}
                {row.success && row.warning && <small className="text-danger">อีเมลส่งแล้ว แต่มีคำเตือนการบันทึก: {row.warning}</small>}
              </div>
              {row.success && (
                <div className="rfq-vendor-confirm">
                  <select
                    value={vendorForms[row.id]?.vendor_id || ""}
                    onChange={(event) => {
                      const vendor = (options.vendors || []).find(
                        (item) => item.id === event.target.value
                      );
                      setVendorForm(row.id, {
                        vendor_id: event.target.value,
                        vendor_name: vendor?.name || "",
                      });
                    }}
                  >
                    <option value="">ระบุชื่อ Vendor เอง</option>
                    {(options.vendors || []).map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendorLabel(vendor)}
                      </option>
                    ))}
                  </select>
                  {!vendorForms[row.id]?.vendor_id && (
                    <input
                      value={vendorForms[row.id]?.vendor_name || ""}
                      onChange={(event) =>
                        setVendorForm(row.id, { vendor_name: event.target.value })
                      }
                      placeholder="ชื่อ Vendor ที่ส่งหา"
                    />
                  )}
                  <button
                    className="mini primary"
                    type="button"
                    disabled={vendorBusy === row.id || !row.vendor_pending}
                    onClick={() => saveVendor(row)}
                  >
                    {row.vendor_pending
                      ? vendorBusy === row.id
                        ? "กำลังบันทึก..."
                        : "บันทึก Vendor"
                      : "บันทึกแล้ว"}
                  </button>
                  {row.gmail_link && (
                    <a className="mini link" href={row.gmail_link} target="_blank" rel="noreferrer">
                      เปิด Gmail
                    </a>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        {pendingVendors > 0 && (
          <div className="alert warning">
            ยังไม่ได้บันทึกชื่อ Vendor {pendingVendors} รายการ กรุณาบันทึกเพื่อให้ค้นหาใน PO Balance ได้ครบ
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn primary"
            type="button"
            disabled={pendingVendors > 0}
            onClick={() => onSent?.(sendResult)}
          >
            เสร็จสิ้น
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`ส่งคำขอราคา · ${orderIds.length} Order`} onClose={onClose} wide>
      <form onSubmit={send}>
        <Alert>{error}</Alert>
        {busy && !preview ? (
          <div className="empty">กำลังตรวจ Group Order และ JOB...</div>
        ) : preview ? (
          <>
            <div className="alert info">
              ระบบจะแยกอีเมล 1 Thread ต่อ Vendor และต่อ Group Order โดยอัตโนมัติ
            </div>
            <div className="form-grid">
              <label className="field span2">
                <span>To · อีเมล Vendor *</span>
                <textarea
                  rows="3"
                  value={recipients}
                  onChange={(event) => setRecipients(event.target.value)}
                  placeholder="vendor1@example.com, vendor2@example.com"
                  required
                />
                <small className="field-help">ใส่ได้หลาย Vendor คั่นด้วย comma หรือขึ้นบรรทัดใหม่</small>
              </label>
              <label className="field span2">
                <span>Subject (English) *</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} required />
                <small className="field-help">ใช้ตัวแปร {"{{RFQ_NO}}"}, {"{{GROUP_ORDER}}"}, {"{{JOB}}"} ได้</small>
              </label>
              <label className="field span2">
                <span>ข้อความเริ่มต้น (ภาษาไทย) *</span>
                <textarea rows="7" value={body} onChange={(event) => setBody(event.target.value)} required />
              </label>
              <label className="field span2">
                <span>ไฟล์แนบ</span>
                <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                <small className="field-help">แนบไฟล์ชุดเดียวกันกับทุกอีเมลในการส่งครั้งนี้</small>
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
                    <span>CC ของ Group นี้ (ลบหรือเพิ่มได้)</span>
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
                          <th>Item ID</th><th>Part Name</th><th>Part Detail</th><th>จำนวน</th><th>Unit</th>
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
            {busy ? "กำลังส่ง..." : `ส่ง ${splitEmails(recipients).length || ""} Vendor`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
