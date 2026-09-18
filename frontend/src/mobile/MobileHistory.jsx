import { useEffect, useState } from "react";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt } from "../components/Common";
import { EditHistory } from "../pages/History";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileHistory() {
  const auth = useAuth();
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({});
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 });
  const [type, setType] = useState("ALL");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(q.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  async function load(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        type,
        q: search,
        requester_id: "",
        recorder_id: "",
        page: String(page),
        page_size: "100",
      });
      const [history, optionRows] = await Promise.all([
        apiGet(`/history/?${params}`, { forceRefresh }),
        apiGet("/options/", { forceRefresh }),
      ]);
      setRows(history.results || []);
      setMeta(history || {});
      setOptions(optionRows || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [type, page, search]);

  async function remove(row) {
    if (!confirm(`ยืนยันลบ/ยกเลิกรายการ ${row.item_id}?`)) return;
    try {
      await apiDelete(`/history/${row.id}/delete/`);
      if (page !== 1) setPage(1);
      else await load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return <MobilePage title="History" subtitle="ประวัติรับเข้า / เบิกออก / ปรับยอด" actions={<button className="m-icon-action" onClick={() => load(true)}>↻</button>}>
    <Alert>{error}</Alert>
    <div className="m-segment wide">{[["ALL", "ทั้งหมด"], ["IN", "รับเข้า"], ["OUT", "เบิกออก"], ["ADJUSTMENT", "ปรับยอด"]].map(([key, label]) => <button key={key} className={type === key ? "active" : ""} onClick={() => { setType(key); setPage(1); }}>{label}</button>)}</div>
    <MobileSearch value={q} onChange={setQ} placeholder="Item / Part / Machine / Employee..." />
    {loading ? <MobileLoading /> : rows.length === 0 ? <MobileEmpty /> : <div className="m-card-list">{rows.map((row) => <article className="m-history-card" key={row.id}>
      <div className="m-row-between"><div><b>{row.item_id}</b><small>{row.date} {row.time}</small></div><span className={`m-tx ${row.type === "IN" ? "receive" : row.type === "OUT" ? "issue" : "adjust"}`}>{row.type === "IN" ? "รับเข้า" : row.type === "OUT" ? "เบิกออก" : "ปรับยอด"}</span></div>
      <h3>{row.part_name}</h3><p>{row.part_detail || "-"}</p>
      <div className="m-history-qty"><span>จำนวน</span><strong>{fmt(row.quantity)} {row.unit}</strong></div>
      <div className="m-info-grid"><span>Machine<b>{row.machine || "-"}</b></span><span>ผู้เบิก<b>{row.requester || "-"}</b></span><span>ผู้บันทึก<b>{row.recorder || "-"}</b></span><span>Location<b>{row.location || "-"}</b></span></div>
      {row.remark && <div className="m-note">{row.remark}</div>}
      {(auth.can("can_edit_history") || auth.can("can_delete_history")) && <div className="m-card-actions">{auth.can("can_edit_history") && <button onClick={() => setEdit(row)}>แก้ไข</button>}{auth.can("can_delete_history") && <button className="danger" onClick={() => remove(row)}>ลบ</button>}</div>}
    </article>)}</div>}
    <div className="m-pagination">
      <button disabled={loading || !meta.has_previous} onClick={() => setPage((current) => Math.max(1, current - 1))}>← ก่อนหน้า</button>
      <span>{meta.count ? `${meta.page || 1} / ${meta.total_pages || 1} · ${meta.count} รายการ` : `${meta.page || 1} / ${meta.total_pages || 1}`}</span>
      <button disabled={loading || !meta.has_next} onClick={() => setPage((current) => current + 1)}>ถัดไป →</button>
    </div>
    {edit && <EditHistory row={edit} options={options} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(true); }} />}
  </MobilePage>;
}
