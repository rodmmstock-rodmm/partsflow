import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, SearchableSelect, fmt, formatDMY, money } from "../components/Common";

const MESSAGE_LABELS = {
  RFQ_REQUEST: "ขอราคา",
  PRICE_FOLLOW_UP: "ตามราคา",
  DELIVERY_FOLLOW_UP: "ตามวันที่จัดส่ง",
  VENDOR_REPLY: "Vendor ตอบกลับ",
};

function localDate(value) {
  return formatDMY(value, true);
}

function inputDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function quoteAttachments(messages) {
  return (messages || []).flatMap((message) =>
    (message.attachments || [])
      .filter((file) => file.quotation_revision > 0)
      .map((file) => ({ ...file, message }))
  );
}

function balanceForm(rfq) {
  return {
    quotation_received_at: inputDateTime(rfq.po_balance?.quotation_received_at),
    price: rfq.po_balance?.price || "",
    currency: rfq.po_balance?.currency || "THB",
    lead_time_days: rfq.po_balance?.lead_time_days ?? "",
    vendor_delivery_date: rfq.po_balance?.vendor_delivery_date || "",
    actual_delivery_date: rfq.po_balance?.actual_delivery_date || "",
    note: rfq.po_balance?.note || "",
  };
}

function FollowUpModal({ rfq, type, employee, onClose, onRecorded }) {
  const price = type === "PRICE_FOLLOW_UP";
  const [cc, setCc] = useState((rfq.cc_emails || []).join(", "));
  const [body, setBody] = useState(
    price
      ? `เรียน ผู้ขาย\n\nขอติดตามใบเสนอราคาสำหรับ ${rfq.rfq_number} ที่ได้ส่งไว้ก่อนหน้านี้ กรุณาแจ้งสถานะและวันที่คาดว่าจะส่งใบเสนอราคาได้\n\nขอบคุณครับ/ค่ะ\n${employee?.name || ""}`
      : `เรียน ผู้ขาย\n\nขอติดตามกำหนดการจัดส่งสำหรับรายการอ้างอิง ${rfq.rfq_number} กรุณายืนยันวันที่จัดส่งล่าสุด และแจ้งสาเหตุหากกำหนดการมีการเปลี่ยนแปลง\n\nขอบคุณครับ/ค่ะ\n${employee?.name || ""}`
  );
  const [emailLink, setEmailLink] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => inputDateTime(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function record(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost(`/rfqs/${rfq.id}/follow-up/`, {
        message_type: type,
        body_text: body,
        cc_emails: cc,
        email_link: emailLink,
        occurred_at: new Date(occurredAt).toISOString(),
      });
      onRecorded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={price ? "บันทึกการตามราคา" : "บันทึกการตามวันที่จัดส่ง"} onClose={onClose} wide>
      <form onSubmit={record}>
        <div className="alert info">
          ส่งอีเมลติดตามด้วยตนเองก่อน แล้วนำลิงก์อีเมลมาบันทึกในประวัติของ {rfq.rfq_number}
        </div>
        <div className="form-grid">
          <label className="field">
            <span>To</span>
            <input value={rfq.recipient_email || ""} readOnly />
          </label>
          <label className="field">
            <span>Subject (English)</span>
            <input value={rfq.subject || ""} readOnly />
          </label>
          <label className="field span2">
            <span>CC (แก้ไขหรือลบได้)</span>
            <textarea rows="2" value={cc} onChange={(event) => setCc(event.target.value)} />
          </label>
          <label className="field span2">
            <span>ข้อความ (ภาษาไทย)</span>
            <textarea rows="8" value={body} onChange={(event) => setBody(event.target.value)} required />
          </label>
          <label className="field">
            <span>วันที่และเวลาที่ติดตาม *</span>
            <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
          </label>
          <label className="field">
            <span>ลิงก์อีเมลติดตาม *</span>
            <input type="url" value={emailLink} onChange={(event) => setEmailLink(event.target.value)} placeholder="https://mail.google.com/..." required />
          </label>
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกการติดตาม"}</button>
        </div>
      </form>
    </Modal>
  );
}

function POBalanceDetail({ initial, options, auth, onClose, onChanged }) {
  const [rfq, setRfq] = useState(initial);
  const [form, setForm] = useState(() => balanceForm(initial));
  const [vendorId, setVendorId] = useState(initial.vendor_id || "");
  const [vendorName, setVendorName] = useState(initial.vendor || "");
  const [followType, setFollowType] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function reload() {
    const fresh = await apiGet(`/po-balances/${rfq.id}/`, { forceRefresh: true, cache: false });
    setRfq(fresh);
    setForm(balanceForm(fresh));
    onChanged?.(fresh);
    return fresh;
  }

  async function saveBalance(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      const result = await apiPatch(`/po-balances/${rfq.id}/`, {
        ...form,
        quotation_received_at: form.quotation_received_at
          ? new Date(form.quotation_received_at).toISOString()
          : "",
      });
      setRfq(result);
      setForm(balanceForm(result));
      onChanged?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function saveVendor() {
    setBusy("vendor");
    setError("");
    try {
      const result = await apiPatch(`/rfqs/${rfq.id}/vendor/`, {
        vendor_id: vendorId,
        vendor_name: vendorName,
      });
      setRfq((current) => ({ ...current, ...result }));
      onChanged?.({ ...rfq, ...result });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function download(file) {
    setError("");
    try {
      await apiDownload(file.download_url, file.filename);
    } catch (err) {
      setError(err.message);
    }
  }

  const quotes = quoteAttachments(rfq.messages);

  return (
    <>
      <Modal title={`PO Balance · ${rfq.rfq_number}`} onClose={onClose} wide>
        <Alert>{error}</Alert>
        <div className="po-detail-head">
          <div>
            <span>Vendor / Email</span>
            <strong>{rfq.vendor || "ยังไม่ระบุ Vendor"}</strong>
            <small>{rfq.recipient_email}</small>
          </div>
          <div>
            <span>ส่งคำขอราคา</span>
            <strong>{localDate(rfq.sent_at)}</strong>
            <small>{rfq.sent_by || "-"}</small>
          </div>
          {(rfq.email_link || rfq.gmail_link) && <a className="btn ghost" href={rfq.email_link || rfq.gmail_link} target="_blank" rel="noreferrer">เปิดอีเมลขอราคา</a>}
        </div>

        {!rfq.vendor && auth.can("can_edit_purchase_info") && (
          <section className="po-section">
            <h3>บันทึกชื่อ Vendor หลังส่ง</h3>
            <div className="po-inline-form">
              <SearchableSelect
                value={vendorId}
                options={options.vendors || []}
                onChange={(value, vendor) => {
                  setVendorId(value);
                  setVendorName(vendor?.name || "");
                }}
                getLabel={(vendor) => `${vendor.code} · ${vendor.name}`}
                getSearchText={(vendor) => `${vendor.code || ""} ${vendor.name || ""} ${vendor.email || ""} ${vendor.contact_person || ""}`}
                placeholder="พิมพ์ชื่อหรือรหัส Vendor"
              />
              <button className="btn primary" type="button" onClick={saveVendor} disabled={busy === "vendor" || !vendorId}>บันทึก Vendor</button>
            </div>
          </section>
        )}

        <section className="po-section">
          <h3>รายการ Order · Group {rfq.group_order} · JOB {rfq.job}</h3>
          <div className="table-wrap compact"><table><thead><tr><th>Order</th><th>Part ID</th><th>Part Name</th><th>Part Detail</th><th>จำนวน</th><th>Unit</th></tr></thead><tbody>{(rfq.items || []).map((item) => <tr key={item.id}><td>{item.order_number}</td><td><b>{item.item_id || "-"}</b></td><td>{item.part_name}</td><td>{item.part_detail || "-"}</td><td>{fmt(item.amount)}</td><td>{item.unit}</td></tr>)}</tbody></table></div>
        </section>

        <section className="po-section">
          <div className="section-head">
            <div><h3>ข้อมูลใบเสนอราคาและการจัดส่ง</h3><p>บันทึกข้อมูลและลิงก์อีเมลติดตามด้วยตนเอง</p></div>
            {auth.can("can_edit_purchase_info") && <div className="page-actions"><button className="btn ghost" type="button" onClick={() => setFollowType("PRICE_FOLLOW_UP")}>ตามราคา</button><button className="btn ghost" type="button" onClick={() => setFollowType("DELIVERY_FOLLOW_UP")}>ตามวันที่จัดส่ง</button></div>}
          </div>
          <form onSubmit={saveBalance}>
            <div className="form-grid three">
              <label className="field"><span>วันที่ได้รับใบเสนอราคา</span><input type="datetime-local" value={form.quotation_received_at} onChange={(event) => set("quotation_received_at", event.target.value)} /></label>
              <label className="field"><span>ราคา</span><input type="number" min="0" step="0.0001" value={form.price} onChange={(event) => set("price", event.target.value)} /></label>
              <label className="field"><span>สกุลเงิน</span><input value={form.currency} onChange={(event) => set("currency", event.target.value.toUpperCase())} /></label>
              <label className="field"><span>Lead time (วัน)</span><input type="number" min="0" value={form.lead_time_days} onChange={(event) => set("lead_time_days", event.target.value)} /></label>
              <label className="field"><span>วันที่จัดส่งที่ Vendor แจ้ง</span><input type="date" value={form.vendor_delivery_date} onChange={(event) => set("vendor_delivery_date", event.target.value)} /></label>
              <label className="field"><span>วันที่จัดส่งจริง</span><input type="date" value={form.actual_delivery_date} onChange={(event) => set("actual_delivery_date", event.target.value)} /></label>
              <label className="field span3"><span>หมายเหตุ</span><textarea rows="3" value={form.note} onChange={(event) => set("note", event.target.value)} /></label>
            </div>
            {auth.can("can_edit_purchase_info") && <div className="modal-actions compact"><button className="btn primary" disabled={busy === "save"}>{busy === "save" ? "กำลังบันทึก..." : "บันทึก PO Balance"}</button></div>}
          </form>
        </section>

        <section className="po-section">
          <h3>ใบเสนอราคาที่ Vendor ส่งกลับ ({quotes.length})</h3>
          {quotes.length ? <div className="attachment-list">{quotes.map((file) => <button type="button" key={file.id} onClick={() => download(file)}><span>Revision {file.quotation_revision}</span><b>{file.filename}</b><small>{localDate(file.message.occurred_at)}</small></button>)}</div> : <div className="empty compact">ยังไม่มีไฟล์ใบเสนอราคาที่บันทึกไว้</div>}
        </section>

        <section className="po-section">
          <h3>To / CC และประวัติอีเมล</h3>
          <div className="po-mail-addresses"><span><b>To</b>{(rfq.to_emails || []).join(", ") || "-"}</span><span><b>CC</b>{(rfq.cc_emails || []).join(", ") || "-"}</span></div>
          <div className="mail-timeline">
            {(rfq.messages || []).map((message) => (
              <article key={message.id} className={`mail-event ${message.direction.toLowerCase()}`}>
                <header><div><strong>{MESSAGE_LABELS[message.message_type] || message.message_type}</strong><span>{message.direction === "INBOUND" ? message.from_email : message.sent_by || message.from_email}</span></div><time>{localDate(message.occurred_at)}</time></header>
                <p>{message.body_text || "-"}</p>
                <div className="mail-event-meta"><span>To: {(message.to_emails || []).join(", ") || "-"}</span><span>CC: {(message.cc_emails || []).join(", ") || "-"}</span></div>
                {(message.attachments || []).length > 0 && <div className="mail-files">{message.attachments.map((file) => file.download_url ? <button type="button" key={file.id} onClick={() => download(file)}>{file.filename}</button> : <span key={file.id}>{file.filename}</span>)}</div>}
                {(message.email_link || message.gmail_link) && <a href={message.email_link || message.gmail_link} target="_blank" rel="noreferrer">เปิดอีเมลนี้</a>}
              </article>
            ))}
          </div>
        </section>

        <div className="modal-actions"><button className="btn ghost" type="button" onClick={onClose}>ปิด</button></div>
      </Modal>
      {followType && <FollowUpModal rfq={rfq} type={followType} employee={auth.employee} onClose={() => setFollowType("")} onRecorded={async () => { setFollowType(""); await reload(); }} />}
    </>
  );
}

function CCRules({ onError }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ rule_type: "DEFAULT", job: "", email: "", display_name: "" });
  async function load() {
    try { setRows((await apiGet("/rfq-cc-rules/", { forceRefresh: true })).results || []); }
    catch (err) { onError(err.message); }
  }
  useEffect(() => { load(); }, []);
  async function add(event) {
    event.preventDefault();
    try { await apiPost("/rfq-cc-rules/", form); setForm((current) => ({ ...current, email: "", display_name: "" })); await load(); }
    catch (err) { onError(err.message); }
  }
  async function remove(row) {
    try { await apiDelete(`/rfq-cc-rules/${row.id}/`); await load(); }
    catch (err) { onError(err.message); }
  }
  return <details className="panel cc-settings"><summary>ตั้งค่ารายชื่อ CC เริ่มต้น / ตาม JOB</summary><form className="po-inline-form" onSubmit={add}><select value={form.rule_type} onChange={(event) => setForm((current) => ({ ...current, rule_type: event.target.value }))}><option value="DEFAULT">ทุกคำขอราคา</option><option value="JOB">ตาม JOB</option></select>{form.rule_type === "JOB" && <input value={form.job} onChange={(event) => setForm((current) => ({ ...current, job: event.target.value.toUpperCase() }))} placeholder="JOB" required />}<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="อีเมล CC" required /><input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder="ชื่อ (ไม่บังคับ)" /><button className="btn primary">เพิ่ม CC</button></form><div className="cc-rule-list">{rows.map((row) => <span key={row.id}><b>{row.rule_type === "DEFAULT" ? "ทุกครั้ง" : row.job}</b>{row.display_name ? `${row.display_name} · ` : ""}{row.email}<button type="button" onClick={() => remove(row)}>×</button></span>)}</div></details>;
}

export default function POBalance() {
  const auth = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [options, setOptions] = useState({});
  async function load(force = false) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q });
      const [data, opts] = await Promise.all([
        apiGet(`/po-balances/?${params}`, { forceRefresh: force, cache: false }),
        apiGet("/options/", { forceRefresh: force }),
      ]);
      setRows(data.results || []); setOptions(opts || {});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const pendingQuote = useMemo(() => rows.filter((row) => !row.po_balance?.quotation_received_at).length, [rows]);
  return <><PageHeader title="PO Balance" subtitle="ติดตามคำขอราคา ใบเสนอราคา และวันที่จัดส่ง" actions={<button className="btn ghost" onClick={() => load(true)}>Refresh</button>} /><Alert>{error}</Alert>{auth.can("can_edit_purchase_info") && <CCRules onError={setError} />}<div className="kpi-grid three"><div className="kpi-card"><span>RFQ ที่บันทึก</span><strong>{fmt(rows.length)}</strong></div><div className="kpi-card warning"><span>รอใบเสนอราคา</span><strong>{fmt(pendingQuote)}</strong></div><div className="kpi-card success"><span>ได้รับใบเสนอราคา</span><strong>{fmt(rows.length - pendingQuote)}</strong></div></div><section className="panel"><div className="toolbar wrap"><input className="search-input" value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load(true)} placeholder="ค้นหา RFQ / Group Order / Order / Part / Vendor / Email..." /><button className="btn ghost" onClick={() => load(true)}>ค้นหา</button></div>{loading ? <div className="empty">กำลังโหลด...</div> : rows.length === 0 ? <div className="empty">ยังไม่มีรายการขอราคาที่บันทึก</div> : <div className="table-wrap"><table className="po-balance-table"><thead><tr><th>RFQ No.</th><th>Group / JOB</th><th>Order</th><th>Vendor / Email</th><th>วันที่ส่ง / ผู้ส่ง</th><th>ราคา / Lead time</th><th>วันที่จัดส่ง</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="mono-cell"><b>{row.rfq_number}</b></td><td>{row.group_order}<small>{row.job}</small></td><td>{(row.items || []).map((item) => item.order_number).join(", ")}</td><td>{row.vendor || <span className="status warning">รอระบุ Vendor</span>}<small>{row.recipient_email}</small></td><td className="mono-cell">{localDate(row.sent_at)}<small>{row.sent_by || "-"}</small></td><td className="mono-cell">{row.po_balance?.price ? `${money(row.po_balance.price)} ${row.po_balance.currency}` : "-"}<small>{row.po_balance?.lead_time_days == null ? "" : `${row.po_balance.lead_time_days} วัน`}</small></td><td className="mono-cell">{row.po_balance?.vendor_delivery_date || "-"}<small>จริง: {row.po_balance?.actual_delivery_date || "-"}</small></td><td><div className="row-actions"><button className="mini primary" onClick={() => setSelected(row)}>รายละเอียด</button>{(row.email_link || row.gmail_link) && <a className="mini link" href={row.email_link || row.gmail_link} target="_blank" rel="noreferrer">อีเมล</a>}</div></td></tr>)}</tbody></table></div>}</section>{selected && <POBalanceDetail initial={selected} options={options} auth={auth} onClose={() => setSelected(null)} onChanged={(fresh) => { setSelected(fresh); setRows((current) => current.map((row) => row.id === fresh.id ? fresh : row)); }} />}</>;
}
