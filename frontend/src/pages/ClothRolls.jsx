import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { apiGet, apiPatch, apiPost } from "../api";
import { Alert, PageHeader } from "../components/Common";
import { useFeedback } from "../feedback";

const PHASES = [
  { value: "PHASE4", slug: "phase-4", label: "Phase 4" },
  { value: "PHASE11", slug: "phase-11", label: "Phase 11" },
];
const phaseName = (value) => PHASES.find((p) => p.value === value)?.label || value;
const qrUrl = (phase, tokens) => `${window.location.origin}/cloth-rolls/scan/${encodeURIComponent(tokens?.[phase.value] || "")}`;

function Qty({ value }) {
  return <strong style={{ fontSize: 30, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{Number(value || 0).toLocaleString("th-TH")}</strong>;
}

export default function ClothRolls() {
  const { token: qrToken } = useParams();
  const isQr = Boolean(qrToken);
  const feedback = useFeedback();
  const [data, setData] = useState({ stocks: [], transactions: [], employees: [], line_configured: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(lockedPhase?.value || "PHASE4");
  const [type, setType] = useState("OUT");
  const [quantity, setQuantity] = useState("1");
  const [borrowerId, setBorrowerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [thresholds, setThresholds] = useState({ PHASE4: "0", PHASE11: "0" });
  const [savingThreshold, setSavingThreshold] = useState("");
  const [qrImages, setQrImages] = useState({});
  const [showQr, setShowQr] = useState(false);
  const lockedPhase = data.qr_phase ? PHASES.find((p) => p.value === data.qr_phase) : null;

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiGet(`/cloth-rolls/${qrToken ? `?qr_token=${encodeURIComponent(qrToken)}` : ""}`, { cache: false, forceRefresh: true });
      setData(result);
      setThresholds({
        PHASE4: String(result.stocks.find((s) => s.phase === "PHASE4")?.low_stock_threshold ?? 0),
        PHASE11: String(result.stocks.find((s) => s.phase === "PHASE11")?.low_stock_threshold ?? 0),
      });
    } catch (err) {
      setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (lockedPhase) setPhase(lockedPhase.value);
  }, [lockedPhase]);

  useEffect(() => {
    let active = true;
    if (!data.qr_tokens) return () => { active = false; };
    Promise.all(PHASES.map(async (p) => [p.value, await QRCode.toDataURL(qrUrl(p, data.qr_tokens), { width: 240, margin: 1 })]))
      .then((entries) => { if (active) setQrImages(Object.fromEntries(entries)); })
      .catch(() => {});
    return () => { active = false; };
  }, [data.qr_tokens]);

  const currentStock = data.stocks.find((s) => s.phase === phase);
  const transactions = useMemo(() => data.transactions || [], [data.transactions]);

  async function saveTransaction(event) {
    event.preventDefault();
    if (isQr && !loading && !lockedPhase) {
      setError("QR Code ไม่ถูกต้อง กรุณาสแกน QR Code ของ Phase 4 หรือ Phase 11");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost("/cloth-rolls/transactions/", {
        phase,
        transaction_type: type,
        quantity,
        borrower_employee_id: !isQr && type === "OUT" ? borrowerId : "",
        source: isQr ? "QR" : "WEB",
        qr_token: isQr ? qrToken : "",
      });
      setQuantity("1");
      setBorrowerId("");
      await load();
      feedback.showToast("บันทึกรายการสำเร็จ", "success");
    } catch (err) {
      setError(err.message || "บันทึกรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(p) {
    setSavingThreshold(p.value);
    setError("");
    try {
      await apiPatch(`/cloth-rolls/settings/${p.value}/`, {
        low_stock_threshold: thresholds[p.value],
      });
      await load();
      feedback.showToast(`บันทึกจุดแจ้งเตือน ${p.label} แล้ว`, "success");
    } catch (err) {
      setError(err.message || "บันทึกจุดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setSavingThreshold("");
    }
  }

  function printQr(p) {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win || !qrImages[p.value]) return;
    win.document.write(`<!doctype html><html><head><title>QR ${p.label}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}img{width:260px;height:260px}h2{margin:12px 0 4px}p{color:#555;font-size:12px;overflow-wrap:anywhere}</style></head><body><img src="${qrImages[p.value]}" alt="QR Code"/><h2>เบิกจ่ายเศษผ้า - ${p.label}</h2><p>${qrUrl(p, data.qr_tokens)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  }

  if (isQr && !lockedPhase) {
    return <div className="page"><Alert>QR Code ไม่ถูกต้อง กรุณาใช้ QR Code ของ Phase 4 หรือ Phase 11</Alert></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <PageHeader title="เบิกจ่ายเศษผ้า" subtitle="บันทึกการเบิกและรับเข้าเศษผ้า · หน่วยนับม้วน" />
      {error && <Alert>{error}</Alert>}
      {loading ? <div className="empty">กำลังโหลดข้อมูล...</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 20 }}>
          {PHASES.map((p) => {
            const stock = data.stocks.find((s) => s.phase === p.value) || { quantity: 0, low_stock_threshold: 0, is_low: false };
            return <section key={p.value} className="card" style={{ padding: 18, border: phase === p.value && !isQr ? "2px solid var(--primary,#2563eb)" : "1px solid var(--border,#e5e7eb)", borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 17 }}>{p.label}</strong>
                {stock.is_low && <span className="badge danger">เหลือน้อย</span>}
              </div>
              <div style={{ margin: "14px 0 4px" }}><Qty value={stock.quantity} /></div>
              <div style={{ color: "var(--muted,#64748b)", fontSize: 13 }}>ม้วนคงเหลือ</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
                <label style={{ fontSize: 12, flex: 1 }}>แจ้งเตือนเมื่อเหลือไม่เกิน (ม้วน)
                  <input type="number" min="0" step="1" value={thresholds[p.value]} onChange={(e) => setThresholds((old) => ({ ...old, [p.value]: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 5 }} />
                </label>
                <button className="btn secondary" type="button" disabled={savingThreshold === p.value} onClick={() => saveThreshold(p)}>{savingThreshold === p.value ? "กำลังบันทึก" : "บันทึกเกณฑ์"}</button>
              </div>
              {!isQr && <button className="btn ghost" type="button" style={{ marginTop: 12, width: "100%" }} onClick={() => { setPhase(p.value); setType("OUT"); setBorrowerId(""); document.getElementById("cloth-roll-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>ทำรายการ {p.label}</button>}
            </section>;
          })}
        </div>

        {isQr && <div className="card" style={{ padding: 14, marginBottom: 14, borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true">🔒</span><div><strong>Phase จาก QR Code: {lockedPhase.label}</strong><div style={{ color: "var(--muted,#64748b)", fontSize: 13 }}>Phase นี้ถูกล็อก ไม่สามารถเปลี่ยนจากแบบฟอร์มได้</div></div>
        </div>}

        <section id="cloth-roll-form" className="card" style={{ padding: 18, borderRadius: 14, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 19 }}>บันทึกรายการ</h2>
          <form onSubmit={saveTransaction}>
            {!isQr && <label className="field" style={{ display: "block", marginBottom: 14 }}><span>Phase</span>
              <select value={phase} onChange={(e) => { setPhase(e.target.value); setBorrowerId(""); }} style={{ width: "100%" }}>
                {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button type="button" className={type === "OUT" ? "btn primary" : "btn secondary"} style={{ flex: 1 }} onClick={() => setType("OUT")}>เบิก</button>
              <button type="button" className={type === "IN" ? "btn primary" : "btn secondary"} style={{ flex: 1 }} onClick={() => { setType("IN"); setBorrowerId(""); }}>รับเข้า</button>
            </div>
            <label className="field" style={{ display: "block", marginBottom: 14 }}><span>จำนวน (ม้วน) *</span>
              <input required type="number" min="1" step="1" inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            {!isQr && type === "OUT" && <label className="field" style={{ display: "block", marginBottom: 14 }}><span>ชื่อผู้เบิก *</span>
              <select required value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} style={{ width: "100%" }}>
                <option value="">เลือกชื่อผู้เบิก</option>
                {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.name}{employee.department ? ` · ${employee.department}` : ""}</option>)}
              </select>
            </label>}
            <div style={{ color: "var(--muted,#64748b)", fontSize: 13, marginBottom: 14 }}>
              {type === "OUT" ? `คงเหลือปัจจุบัน ${currentStock?.quantity ?? 0} ม้วน` : `ยอดคงเหลือหลังรับเข้า ${(currentStock?.quantity ?? 0) + (Number(quantity) || 0)} ม้วน`}
            </div>
            <button className="btn primary full" disabled={busy || !quantity || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || (!isQr && type === "OUT" && !borrowerId)}>{busy ? "กำลังบันทึก..." : "บันทึกรายการ"}</button>
          </form>
        </section>

        <section className="card" style={{ padding: 18, borderRadius: 14, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>QR Code สำหรับแต่ละ Phase</h2>
            <button className="btn secondary" type="button" onClick={() => setShowQr((v) => !v)}>{showQr ? "ซ่อน QR Code" : "แสดง QR Code"}</button>
          </div>
          {showQr && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginTop: 16 }}>
            {PHASES.map((p) => <div key={p.value} style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <strong>{p.label}</strong>
              {qrImages[p.value] ? <img src={qrImages[p.value]} alt={`QR Code ${p.label}`} style={{ width: 180, maxWidth: "100%", display: "block", margin: "10px auto" }} /> : <div className="empty">กำลังสร้าง QR...</div>}
              <div style={{ fontSize: 11, color: "var(--muted,#64748b)", overflowWrap: "anywhere" }}>{qrUrl(p, data.qr_tokens)}</div>
              <button className="btn secondary" type="button" style={{ marginTop: 10 }} onClick={() => printQr(p)}>พิมพ์ QR</button>
            </div>)}
          </div>}
        </section>

        <section className="card" style={{ padding: 18, borderRadius: 14 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 19 }}>ประวัติการเบิกจ่าย</h2>
          {transactions.length === 0 ? <div className="empty">ยังไม่มีประวัติการเบิกหรือรับเข้า</div> : <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 760 }}>
              <thead><tr><th>วันเวลา</th><th>Phase</th><th>รายการ</th><th>จำนวน</th><th>คงเหลือหลังทำรายการ</th><th>ผู้เบิก</th><th>ผู้บันทึก</th><th>ช่องทาง</th></tr></thead>
              <tbody>{transactions.map((row) => <tr key={row.id}>
                <td>{row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "—"}</td>
                <td>{row.phase_label || phaseName(row.phase)}</td>
                <td>{row.type_label}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{row.quantity} ม้วน</td>
                <td>{row.balance_after} ม้วน</td>
                <td>{row.borrower_name || "—"}</td>
                <td>{row.recorded_by_name || "—"}</td>
                <td>{row.source === "QR" ? "QR Code" : "หน้าเว็บ"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>
        {!data.line_configured && <p style={{ marginTop: 12, color: "var(--muted,#64748b)", fontSize: 12 }}>หมายเหตุ: ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN และ LINE_USER_ID ใน Environment ของ Backend ก่อน ระบบจึงจะส่งแจ้งเตือน LINE ได้</p>}
      </>}
    </div>
  );
}
