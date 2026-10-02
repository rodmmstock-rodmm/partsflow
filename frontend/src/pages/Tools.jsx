import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader } from "../components/Common";
import { useFeedback } from "../feedback";

// The URL encoded in every QR code. Scanning it opens the public,
// no-login borrow/return form at /tool-scan/<code>.
function scanUrl(code) {
  return `${window.location.origin}/tool-scan/${encodeURIComponent(code)}`;
}

export function ToolModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState(
    row || { code: "", name: "", category: "", serial_number: "", location: "", remark: "", active: true }
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (row) {
        await apiPatch(`/tools/${row.id}/`, form);
      } else {
        await apiPost("/tools/", form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={row ? "แก้ไขอุปกรณ์" : "เพิ่มอุปกรณ์"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>Code *</span>
            <input required value={form.code} onChange={(e) => set("code", e.target.value)} />
          </label>
          <label className="field">
            <span>ชื่ออุปกรณ์ *</span>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="field">
            <span>ประเภท</span>
            <input value={form.category || ""} onChange={(e) => set("category", e.target.value)} />
          </label>
          <label className="field">
            <span>Serial Number</span>
            <input value={form.serial_number || ""} onChange={(e) => set("serial_number", e.target.value)} />
          </label>
          <label className="field">
            <span>เก็บไว้ที่</span>
            <input value={form.location || ""} onChange={(e) => set("location", e.target.value)} />
          </label>
          <label className="field span2">
            <span>Remark</span>
            <textarea rows="2" value={form.remark || ""} onChange={(e) => set("remark", e.target.value)} />
          </label>
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ToolQrModal({ tool, onClose }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(scanUrl(tool.code), { width: 320, margin: 1 }).then((url) => {
      if (alive) setDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [tool.code]);

  function printQr() {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR ${tool.code}</title>
      <style>
        body{font-family:sans-serif;text-align:center;padding:24px}
        img{width:260px;height:260px}
        h2{margin:12px 0 2px;font-size:16px}
        p{margin:0;color:#555;font-size:12px}
      </style></head>
      <body>
        <img src="${dataUrl}"/>
        <h2>${tool.code}</h2>
        <p>${tool.name}</p>
        <script>window.onload=()=>{window.print();}</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <Modal title={`QR Code - ${tool.code}`} onClose={onClose}>
      <div className="tool-qr-box">
        {dataUrl ? <img src={dataUrl} alt={`QR ${tool.code}`} /> : <div className="empty">กำลังสร้าง QR...</div>}
        <div className="tool-qr-caption">
          <strong>{tool.code}</strong>
          <span>{tool.name}</span>
        </div>
      </div>
      <div className="modal-actions">
        <a className="btn ghost" href={dataUrl} download={`${tool.code}.png`}>
          ดาวน์โหลด PNG
        </a>
        <button type="button" className="btn primary" onClick={printQr} disabled={!dataUrl}>
          พิมพ์
        </button>
      </div>
    </Modal>
  );
}

function EquipmentTab() {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(undefined);
  const [qrTool, setQrTool] = useState(null);

  async function load() {
    try {
      const d = await apiGet("/tools/");
      setRows(d.results || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      rows.filter(
        (x) => !q || `${x.code} ${x.name} ${x.category} ${x.serial_number} ${x.location}`.toLowerCase().includes(q.toLowerCase())
      ),
    [rows, q]
  );

  async function remove(x) {
    const ok = await confirm(`ยืนยันลบอุปกรณ์ ${x.code}?`, {
      title: "ยืนยันการลบ",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setError("");
    try {
      await apiDelete(`/tools/${x.id}/`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>จัดการรายการอุปกรณ์เครื่องมือ</h2>
        {auth.can("can_add_tool") && (
          <button className="btn primary" onClick={() => setModal(null)}>
            + เพิ่มอุปกรณ์
          </button>
        )}
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา Code / ชื่อ / ประเภท / Serial / ที่เก็บ..."
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>ชื่ออุปกรณ์</th>
              <th>ประเภท</th>
              <th>ที่เก็บ</th>
              <th>สถานะ</th>
              <th>QR</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.id}>
                <td className="mono-cell">
                  <b>{x.code}</b>
                </td>
                <td>{x.name}</td>
                <td>{x.category || "-"}</td>
                <td>{x.location || "-"}</td>
                <td>
                  <span className={`status ${x.status === "BORROWED" ? "warning" : "success"}`}>
                    {x.status_label}
                  </span>
                </td>
                <td>
                  <button type="button" className="mini" onClick={() => setQrTool(x)}>
                    QR
                  </button>
                </td>
                <td>
                  {(auth.can("can_edit_tool") || auth.can("can_delete_tool")) && (
                    <div className="row-actions">
                      {auth.can("can_edit_tool") && (
                        <button className="mini" onClick={() => setModal(x)}>
                          แก้ไข
                        </button>
                      )}
                      {auth.can("can_delete_tool") && (
                        <button className="mini danger" onClick={() => remove(x)}>
                          ลบ
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal !== undefined && (
        <ToolModal
          row={modal}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined);
            load();
          }}
        />
      )}
      {qrTool && <ToolQrModal tool={qrTool} onClose={() => setQrTool(null)} />}
    </section>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (outstandingOnly) params.set("outstanding", "true");
    apiGet(`/tools/history/?${params.toString()}`)
      .then((d) => alive && setRows(d.results || []))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, outstandingOnly]);

  return (
    <section className="panel">
      <div className="section-head">
        <h2>ประวัติการเบิก-คืนอุปกรณ์</h2>
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา Code / ชื่ออุปกรณ์ / ผู้เบิก..."
        />
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={outstandingOnly}
            onChange={(e) => setOutstandingOnly(e.target.checked)}
          />
          แสดงเฉพาะที่ยังไม่คืน
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>อุปกรณ์</th>
              <th>ผู้เบิก</th>
              <th>วัตถุประสงค์</th>
              <th>วันที่เบิก</th>
              <th>กำหนดคืน</th>
              <th>วันที่คืน</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="empty">
                  กำลังโหลด...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  ไม่มีประวัติ
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id}>
                  <td className="mono-cell">{l.tool_code}</td>
                  <td>{l.tool_name}</td>
                  <td>{l.borrower_name}</td>
                  <td>{l.purpose || "-"}</td>
                  <td>{l.borrowed_at ? l.borrowed_at.slice(0, 16).replace("T", " ") : "-"}</td>
                  <td>{l.expected_return_date || "-"}</td>
                  <td>{l.returned_at ? l.returned_at.slice(0, 16).replace("T", " ") : "-"}</td>
                  <td>
                    <span className={`status ${l.is_outstanding ? "warning" : "success"}`}>
                      {l.is_outstanding ? "ยังไม่คืน" : "คืนแล้ว"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Tools() {
  const auth = useAuth();
  const [tab, setTab] = useState("equipment");
  return (
    <>
      <PageHeader
        title="ยืม-คืนอุปกรณ์เครื่องมือ"
        subtitle="จัดการอุปกรณ์ สร้าง QR Code สำหรับสแกนเบิก/คืน และดูประวัติการเบิก-คืน"
      />
      <div className="tab-row page-tabs">
        <button className={`tab ${tab === "equipment" ? "active" : ""}`} onClick={() => setTab("equipment")}>
          จัดการรายการอุปกรณ์
        </button>
        <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          ประวัติการเบิก-คืน
        </button>
      </div>
      {tab === "equipment" ? <EquipmentTab /> : <HistoryTab />}
    </>
  );
}
