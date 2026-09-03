import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, SearchableSelect, fmt } from "../components/Common";

const blank = {
  name: "",
  factory: "MM-4",
  part_id: "",
  machine_id: "",
  remark: "",
};

export function FastOrderModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState(row ? { ...blank, ...row } : blank);
  const [partQuery, setPartQuery] = useState(row?.item_id || "");
  const [partResults, setPartResults] = useState([]);
  const [machines, setMachines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((x) => ({ ...x, [key]: value }));

  useEffect(() => {
    apiGet("/machines/")
      .then((d) => setMachines(d.results || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (row?.part_id) return;
    const q = partQuery.trim();
    if (q.length < 2) {
      setPartResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      apiGet(`/parts/?page=1&page_size=20&q=${encodeURIComponent(q)}`)
        .then((d) => setPartResults(d.results || []))
        .catch((err) => setError(err.message));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [partQuery, row?.part_id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (!form.part_id) throw new Error("กรุณาเลือก Part ID จากผลการค้นหา");
      if (!form.machine_id) throw new Error("กรุณาเลือก Machine");

      if (row?.id) {
        await apiPatch(`/fast-orders/${row.id}/`, form);
      } else {
        await apiPost("/fast-orders/", form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={row ? "แก้ไข Fast Order" : "เพิ่ม Fast Order"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field span2">
            <span>ชื่อรายการ</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น Bearing เครื่อง Cutting"
            />
          </label>

          <label className="field">
            <span>Factory *</span>
            <select
              value={form.factory}
              onChange={(e) => set("factory", e.target.value)}
            >
              <option value="MM-4">Phase4</option>
              <option value="MM-11">Phase11</option>
            </select>
          </label>

          <label className="field span2">
            <span>Part ID *</span>
            <input
              value={partQuery}
              onChange={(e) => {
                setPartQuery(e.target.value);
                if (!row?.id) set("part_id", "");
              }}
              placeholder="พิมพ์ Part ID / Part Name..."
            />
            {!row?.id && partResults.length > 0 && (
              <div className="panel" style={{ marginTop: 6, padding: 8 }}>
                {partResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="mini"
                    style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }}
                    onClick={() => {
                      set("part_id", p.id);
                      setPartQuery(`${p.sku} · ${p.name}`);
                      setPartResults([]);
                    }}
                  >
                    <b>{p.sku}</b> · {p.name} · Stock {fmt(p.stock_qty)} {p.unit_code}
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="field span2">
            <span>Machine *</span>
            <SearchableSelect
              required
              value={form.machine_id}
              options={machines}
              onChange={(value) => set("machine_id", value)}
              getLabel={(machine) => machine.code}
              getSearchText={(machine) => `${machine.code || ""} ${machine.name || ""} ${machine.location || ""}`}
              placeholder="พิมพ์รหัส Machine"
            />
          </label>

          <label className="field span2">
            <span>Remark</span>
            <textarea
              rows="2"
              value={form.remark}
              onChange={(e) => set("remark", e.target.value)}
            />
          </label>

          <div className="alert success span2">
            เมื่อกดสั่งจาก Fast Order ระบบจะสร้าง Order Normal โดย JOB = SPARE
            และให้กรอกเพียงจำนวนเท่านั้น
          </div>
        </div>

        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QuickOrderModal({ row, onClose, onSaved }) {
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(`/fast-orders/${row.id}/order/`, {
        amount,
      });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="สั่ง Fast Order" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="confirm-box">
          <dl>
            <dt>Part ID</dt>
            <dd>{row.item_id}</dd>
            <dt>Part</dt>
            <dd>{row.part_name}</dd>
            <dt>Machine</dt>
            <dd>{row.machine_code} · {row.machine_name}</dd>
            <dt>Factory</dt>
            <dd>{row.factory === "MM-11" ? "Phase11" : "Phase4"}</dd>
            <dt>JOB</dt>
            <dd><b>SPARE</b></dd>
          </dl>
        </div>

        <label className="field">
          <span>จำนวน *</span>
          <input
            autoFocus
            type="number"
            min="1"
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "กำลังเพิ่ม Order..." : "เพิ่มเข้า Order Normal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function FastOrders() {
  const auth = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState(undefined);
  const [quick, setQuick] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await apiGet("/fast-orders/");
      setRows(d.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((x) =>
      `${x.name} ${x.item_id} ${x.part_name} ${x.machine_code} ${x.machine_name}`
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, q]);

  async function remove(row) {
    if (!window.confirm(`ปิด Fast Order ${row.item_id} ?`)) return;
    try {
      await apiDelete(`/fast-orders/${row.id}/`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Fast Order"
        subtitle="เตรียมรายการ SPARE ไว้ล่วงหน้า แล้วเพิ่มเข้า Order Normal ด้วยการกรอกจำนวนเพียงอย่างเดียว"
        actions={
          auth.can("can_add_order") && (
            <button className="btn primary" onClick={() => setEditor(null)}>
              + เพิ่ม Fast Order
            </button>
          )
        }
      />

      <Alert>{error}</Alert>
      {message && <div className="alert success">{message}</div>}

      <section className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา Part ID / Part / Machine..."
          />
        </div>

        {loading ? (
          <div className="empty">กำลังโหลด...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part ID</th>
                  <th>Part Name</th>
                  <th>Factory</th>
                  <th>Machine</th>
                  <th>JOB</th>
                  <th>Remark</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <td><b>{x.item_id}</b></td>
                    <td>{x.part_name}</td>
                    <td>{x.factory === "MM-11" ? "Phase11" : "Phase4"}</td>
                    <td>{x.machine_code} · {x.machine_name}</td>
                    <td><span className="status success">SPARE</span></td>
                    <td>{x.remark || "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="mini success" onClick={() => setQuick(x)}>
                          สั่ง
                        </button>
                        {auth.can("can_add_order") && (
                          <>
                            <button className="mini" onClick={() => setEditor(x)}>
                              แก้ไข
                            </button>
                            <button className="mini danger" onClick={() => remove(x)}>
                              ปิด
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editor !== undefined && (
        <FastOrderModal
          row={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            load();
          }}
        />
      )}

      {quick && (
        <QuickOrderModal
          row={quick}
          onClose={() => setQuick(null)}
          onSaved={(order) => {
            setQuick(null);
            setMessage(
              `เพิ่ม ${order.order_number} เข้า Order Normal แล้ว · ${order.item_id} × ${order.amount}`
            );
          }}
        />
      )}
    </>
  );
}
