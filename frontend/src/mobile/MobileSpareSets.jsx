import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt } from "../components/Common";
import SpareSetModal from "../components/SpareSetModal";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileSpareSets() {
  const auth = useAuth(), navigate = useNavigate();
  const [rows, setRows] = useState([]), [options, setOptions] = useState({}), [q, setQ] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState(""), [editor, setEditor] = useState(null);
  async function load(force = false) { setLoading(true); setError(""); try { const [d, o] = await Promise.all([apiGet("/spare-sets/", { forceRefresh: force }), apiGet("/options/")]); setRows(d.results || []); setOptions(o || {}); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => rows.filter(x => !q || `${x.name} ${x.machine_code} ${x.machine_name} ${(x.items || []).map(i => `${i.sku} ${i.name}`).join(" ")}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  async function remove(row) { if (!confirm(`ลบ Set ${row.name}?`)) return; try { await apiDelete(`/spare-sets/${row.id}/`); await load(true); } catch (e) { setError(e.message); } }
  return <MobilePage title="Spare Sets" subtitle="ชุดอะไหล่ประจำเครื่องจักร" actions={<><button className="m-icon-action" onClick={() => navigate("/")}>←</button>{auth.can("can_edit_parts") && <button className="m-icon-action" onClick={() => setEditor({})}>＋</button>}</>}>
    <Alert>{error}</Alert><MobileSearch value={q} onChange={setQ} placeholder="Set / Machine / Item ID..."/>
    {loading ? <MobileLoading/> : shown.length === 0 ? <MobileEmpty text="ยังไม่มี Machine Spare Set"/> : <div className="m-card-list">{shown.map(set => <article className="m-spare-set-card" key={set.id}><div className="m-row-between"><div><b>{set.machine_code}</b><h3>{set.name}</h3><small>{set.machine_name}</small></div><span className="m-factory">{set.item_count} Parts</span></div>{set.description && <p>{set.description}</p>}<div className="m-spare-items">{set.items.map(item => <div key={item.id}><div><b>{item.sku}</b><span>{item.name}</span></div><strong>{fmt(item.quantity)} {item.unit_code}</strong></div>)}</div>{auth.can("can_edit_parts") && <div className="m-card-actions"><button onClick={() => setEditor(set)}>แก้ไข</button><button className="danger" onClick={() => remove(set)}>ลบ</button></div>}</article>)}</div>}
    {editor !== null && <SpareSetModal spareSet={editor.id ? editor : null} options={options} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(true); }}/>}
  </MobilePage>;
}
