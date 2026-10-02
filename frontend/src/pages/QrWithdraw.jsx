import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader } from "../components/Common";
import { useFeedback } from "../feedback";

// The standalone site that already exists and already has printed QR codes
// pointing at it - never changed. Adding a QR for a NEW item simply points
// at the same site, the same way every existing QR code already does.
const QR_WITHDRAW_SITE = "https://qr-withdraw.vercel.app";
const scanUrl = (code) => `${QR_WITHDRAW_SITE}/${encodeURIComponent(code)}`;

export function QrItemModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState(row || { code: "", name: "", spec: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (row) {
        await apiPatch(`/qr-withdraw/items/${encodeURIComponent(row.code)}/`, {
          name: form.name,
          spec: form.spec,
        });
      } else {
        await apiPost("/qr-withdraw/items/", form);
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
            <span>Code * {row && "(แก้ไขไม่ได้ - ผูกกับ QR ที่พิมพ์ไว้แล้ว)"}</span>
            <input
              required
              value={form.code}
              disabled={!!row}
              onChange={(e) => set("code", e.target.value)}
            />
          </label>
          <label className="field">
            <span>ชื่ออุปกรณ์ *</span>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="field span2">
            <span>Spec</span>
            <input value={form.spec || ""} onChange={(e) => set("spec", e.target.value)} />
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

export function QrItemQrModal({ item, onClose }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(scanUrl(item.code), { width: 320, margin: 1 }).then((url) => {
      if (alive) setDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [item.code]);

  function printQr() {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR ${item.code}</title>
      <style>
        body{font-family:sans-serif;text-align:center;padding:24px}
        img{width:260px;height:260px}
        h2{margin:12px 0 2px;font-size:16px}
        p{margin:0;color:#555;font-size:12px}
      </style></head>
      <body>
        <img src="${dataUrl}"/>
        <h2>${item.code}</h2>
        <p>${item.name}</p>
        <script>window.onload=()=>{window.print();}</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <Modal title={`QR Code - ${item.code}`} onClose={onClose}>
      <div className="tool-qr-box">
        {dataUrl ? <img src={dataUrl} alt={`QR ${item.code}`} /> : <div className="empty">กำลังสร้าง QR...</div>}
        <div className="tool-qr-caption">
          <strong>{item.code}</strong>
          <span>{item.name}</span>
          <small>{scanUrl(item.code)}</small>
        </div>
      </div>
      <div className="modal-actions">
        <a className="btn ghost" href={dataUrl} download={`${item.code}.png`}>
          ดาวน์โหลด PNG
        </a>
        <button type="button" className="btn primary" onClick={printQr} disabled={!dataUrl}>
          พิมพ์
        </button>
      </div>
    </Modal>
  );
}

function ItemsTab() {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(undefined);
  const [qrItem, setQrItem] = useState(null);

  async function load() {
    try {
      const d = await apiGet("/qr-withdraw/items/");
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
        (x) => !q || `${x.code} ${x.name} ${x.spec}`.toLowerCase().includes(q.toLowerCase())
      ),
    [rows, q]
  );

  async function remove(x) {
    const ok = await confirm(
      `ยืนยันลบอุปกรณ์ ${x.code}? (QR ที่พิมพ์ไว้แล้วสำหรับรหัสนี้จะสแกนไม่เจอข้อมูลอีกต่อไป)`,
      { title: "ยืนยันการลบ", confirmLabel: "ลบ", danger: true }
    );
    if (!ok) return;
    setError("");
    try {
      await apiDelete(`/qr-withdraw/items/${encodeURIComponent(x.code)}/`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>รายการอุปกรณ์</h2>
        {auth.can("can_add_qr_withdraw_item") && (
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
          placeholder="ค้นหา Code / ชื่อ / Spec..."
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>ชื่ออุปกรณ์</th>
              <th>Spec</th>
              <th>QR</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.code}>
                <td className="mono-cell">
                  <b>{x.code}</b>
                </td>
                <td>{x.name}</td>
                <td>{x.spec || "-"}</td>
                <td>
                  <button type="button" className="mini" onClick={() => setQrItem(x)}>
                    QR
                  </button>
                </td>
                <td>
                  {(auth.can("can_edit_qr_withdraw_item") || auth.can("can_delete_qr_withdraw_item")) && (
                    <div className="row-actions">
                      {auth.can("can_edit_qr_withdraw_item") && (
                        <button className="mini" onClick={() => setModal(x)}>
                          แก้ไข
                        </button>
                      )}
                      {auth.can("can_delete_qr_withdraw_item") && (
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
        <QrItemModal
          row={modal}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined);
            load();
          }}
        />
      )}
      {qrItem && <QrItemQrModal item={qrItem} onClose={() => setQrItem(null)} />}
    </section>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    apiGet(`/qr-withdraw/history/${params}`)
      .then((d) => alive && setRows(d.results || []))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <section className="panel">
      <div className="section-head">
        <h2>ประวัติการเบิก</h2>
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา Code / ชื่อ / ผู้เบิก / งาน..."
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>Code</th>
              <th>อุปกรณ์</th>
              <th>Spec</th>
              <th>จำนวน</th>
              <th>ผู้เบิก</th>
              <th>งาน</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="empty">
                  กำลังโหลด...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  ไม่มีประวัติ
                </td>
              </tr>
            ) : (
              rows.map((w) => (
                <tr key={w.id}>
                  <td>{w.created_at ? w.created_at.slice(0, 16).replace("T", " ") : "-"}</td>
                  <td className="mono-cell">{w.code}</td>
                  <td>{w.name}</td>
                  <td>{w.spec || "-"}</td>
                  <td>{w.qty}</td>
                  <td>{w.requester}</td>
                  <td>{w.process}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function QrWithdraw() {
  const [tab, setTab] = useState("items");
  return (
    <>
      <PageHeader
        title="เบิก Screw"
        subtitle="จัดการรายการอุปกรณ์และดูประวัติการเบิก (ระบบสแกนเบิกของเดิมที่ qr-withdraw.vercel.app ไม่เปลี่ยนแปลง)"
      />
      <div className="tab-row page-tabs">
        <button className={`tab ${tab === "items" ? "active" : ""}`} onClick={() => setTab("items")}>
          รายการอุปกรณ์
        </button>
        <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          ประวัติการเบิก
        </button>
      </div>
      {tab === "items" ? <ItemsTab /> : <HistoryTab />}
    </>
  );
}
