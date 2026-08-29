import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, PageHeader, fmt } from "../components/Common";
import SpareSetModal from "../components/SpareSetModal";

export default function SpareSets() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({ machines: [], parts: [] });
  const [q, setQ] = useState("");
  const [machineId, setMachineId] = useState("");
  const [view, setView] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  async function load(force = false) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ active: view === "active" ? "true" : "false" });
      if (q.trim()) params.set("q", q.trim());
      if (machineId) params.set("machine_id", machineId);
      const [data, opts] = await Promise.all([
        apiGet(`/spare-sets/?${params}`, { forceRefresh: force }),
        apiGet("/options/"),
      ]);
      setRows(data.results || []);
      setOptions(opts || {});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [view, machineId]);

  const itemTotal = useMemo(() => rows.reduce((n, x) => n + Number(x.item_count || 0), 0), [rows]);
  async function remove(row) {
    if (!confirm(`ลบ Set “${row.name}” ของ ${row.machine_code}?`)) return;
    try { await apiDelete(`/spare-sets/${row.id}/`); await load(true); }
    catch (err) { setError(err.message); }
  }

  return <>
    <PageHeader title="Machine Spare Sets" subtitle="ชุดอะไหล่ประจำเครื่องจักร · 1 เครื่องมีได้หลาย Set" actions={<><button className="btn ghost" onClick={() => navigate("/")}>← Dashboard</button>{auth.can("can_edit_parts") && <button className="btn primary" onClick={() => setEditor({})}>+ สร้าง Set</button>}</>}/>
    <Alert>{error}</Alert>
    <div className="kpi-grid three compact"><div className="kpi-card"><span>จำนวน Set</span><strong>{fmt(rows.length)}</strong></div><div className="kpi-card info"><span>รายการอะไหล่ใน Set</span><strong>{fmt(itemTotal)}</strong></div><div className="kpi-card"><span>Machine ที่มี Set</span><strong>{fmt(new Set(rows.map(x => x.machine_id)).size)}</strong></div></div>
    <div className="tab-row page-tabs"><button className={`tab ${view === "active" ? "active" : ""}`} onClick={() => setView("active")}>Active Sets</button><button className={`tab ${view === "inactive" ? "active" : ""}`} onClick={() => setView("inactive")}>Inactive Sets</button></div>
    <section className="panel">
      <div className="toolbar wrap"><input className="search-input" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load(true)} placeholder="ค้นหา Set / Machine / Item ID / Part..."/><select value={machineId} onChange={e => setMachineId(e.target.value)}><option value="">Machine ทั้งหมด</option>{(options.machines || []).map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select><button className="btn ghost" onClick={() => load(true)}>ค้นหา / รีเฟรช</button></div>
      {loading ? <div className="empty">กำลังโหลด...</div> : rows.length === 0 ? <div className="empty">ยังไม่มี Machine Spare Set</div> : <div className="spare-set-grid">
        {rows.map(set => <article className="spare-set-card" key={set.id}>
          <header><div><div className="spare-set-machine">{set.machine_code} · {set.machine_name}</div><h2>{set.name}</h2><p>{set.description || "ไม่มีรายละเอียด"}</p></div><span className="status info">{set.item_count} Parts</span></header>
          <div className="spare-set-items">{set.items.map(item => <div className="spare-set-item" key={item.id}><div><b>{item.sku}</b><strong>{item.name}</strong><small>{item.maker_name || "-"} · {item.location_code || "-"}</small></div><div className="spare-set-qty"><span>ต่อ Set</span><b>{fmt(item.quantity)} {item.unit_code}</b><small>Stock {fmt(item.stock_qty)}</small></div></div>)}</div>
          {auth.can("can_edit_parts") && <footer><button className="mini" onClick={() => setEditor(set)}>แก้ไข Set</button><button className="mini danger" onClick={() => remove(set)}>ลบ Set</button></footer>}
        </article>)}
      </div>}
    </section>
    {editor !== null && <SpareSetModal spareSet={editor.id ? editor : null} options={options} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(true); }}/>}
  </>;
}
