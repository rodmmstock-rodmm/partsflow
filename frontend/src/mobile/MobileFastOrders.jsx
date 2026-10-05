import { useEffect, useMemo, useState } from "react";
import { useFeedback } from "../feedback";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert } from "../components/Common";
import { BulkOrderModal, FastOrderModal, QuickOrderModal } from "../pages/FastOrders";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileFastOrders() {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [quick, setQuick] = useState(null);
  const [editor, setEditor] = useState(undefined);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOrder, setBulkOrder] = useState(false);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const d = await apiGet("/fast-orders/", { forceRefresh: force });
      setRows(d.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      rows.filter(
        (x) =>
          !q ||
          `${x.item_id} ${x.part_name} ${x.machine_code} ${x.machine_name} ${x.name}`
            .toLowerCase()
            .includes(q.toLowerCase())
      ),
    [rows, q]
  );

  const selectedRows = useMemo(() => rows.filter((x) => selected.has(x.id)), [rows, selected]);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(x) {
    const ok = await confirm(`ยืนยันลบ Fast Order ${x.name || x.item_id}?`, {
      title: "ยืนยันการลบ",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiDelete(`/fast-orders/${x.id}/`);
      await load(true);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <MobilePage
      title="Fast Order"
      subtitle="SPARE แบบกดเร็ว"
      actions={
        <div className="m-page-actions">
          {auth.can("can_add_order") && (
            <button className="m-icon-action" onClick={() => setEditor(null)}>
              ＋
            </button>
          )}
          <button className="m-icon-action" onClick={() => load(true)}>
            ↻
          </button>
        </div>
      }
    >
      <Alert>{error}</Alert>
      {msg && <Alert type="success">{msg}</Alert>}
      <MobileSearch value={q} onChange={setQ} placeholder="Item / Part / Machine..." />

      {auth.can("can_add_order") && selected.size > 0 && (
        <button className="m-fast-button" style={{ width: "100%", marginBottom: 10 }} onClick={() => setBulkOrder(true)}>
          สั่งที่เลือก ({selected.size})
        </button>
      )}

      {loading ? (
        <MobileLoading />
      ) : shown.length === 0 ? (
        <MobileEmpty />
      ) : (
        <div className="m-card-list">
          {shown.map((x) => (
            <article className="m-fast-card m-fast-card-full" key={x.id}>
              {auth.can("can_add_order") && (
                <input
                  type="checkbox"
                  checked={selected.has(x.id)}
                  onChange={() => toggleSelected(x.id)}
                  aria-label={`เลือก ${x.item_id}`}
                  style={{ marginRight: 8 }}
                />
              )}
              <div>
                <span className="m-factory">{x.factory === "MM-11" ? "Phase11" : "Phase4"}</span>
                <b>{x.item_id}</b>
                <h3>{x.part_name}</h3>
                <p>
                  {x.machine_code || "ทั่วไป"} · {x.reorder_qty} {x.unit}
                </p>
                {x.remark && <small>{x.remark}</small>}
              </div>
              <div className="m-fast-actions">
                <button className="m-fast-button" onClick={() => setQuick(x)}>
                  ⚡ สั่ง
                </button>
                {auth.can("can_add_order") && <button onClick={() => setEditor(x)}>แก้ไข</button>}
                {auth.can("can_add_order") && (
                  <button className="danger" onClick={() => remove(x)}>
                    ลบ
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {quick && (
        <QuickOrderModal
          row={quick}
          onClose={() => setQuick(null)}
          onSaved={(r) => {
            setQuick(null);
            setMsg(`เพิ่ม ${r.order_number} แล้ว · ${r.item_id} × ${r.amount}`);
          }}
        />
      )}

      {bulkOrder && (
        <BulkOrderModal
          rows={selectedRows}
          onClose={() => setBulkOrder(false)}
          onSaved={(result) => {
            setBulkOrder(false);
            setSelected(new Set());
            setMsg(`เพิ่มเข้า Order Normal แล้ว ${result.count} รายการ`);
          }}
        />
      )}

      {editor !== undefined && (
        <FastOrderModal
          row={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            load(true);
          }}
        />
      )}
    </MobilePage>
  );
}
