import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader } from "../components/Common";
import { useFeedback } from "../feedback";

function ContactRow({ contact, canEdit, onSave, onRemove }) {
  const [form, setForm] = useState(contact);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  async function commit() {
    setBusy(true);
    try {
      await onSave(contact.id, form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="purchase-field" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr auto" }}>
      <input
        placeholder="ชื่อ"
        value={form.name || ""}
        disabled={!canEdit || busy}
        onChange={(e) => set("name", e.target.value)}
        onBlur={commit}
      />
      <input
        placeholder="ตำแหน่ง"
        value={form.role || ""}
        disabled={!canEdit || busy}
        onChange={(e) => set("role", e.target.value)}
        onBlur={commit}
      />
      <input
        placeholder="เบอร์โทร"
        value={form.phone || ""}
        disabled={!canEdit || busy}
        onChange={(e) => set("phone", e.target.value)}
        onBlur={commit}
      />
      <input
        placeholder="อีเมล"
        value={form.email || ""}
        disabled={!canEdit || busy}
        onChange={(e) => set("email", e.target.value)}
        onBlur={commit}
      />
      {canEdit && (
        <button
          type="button"
          className="mini danger"
          disabled={busy}
          onClick={() => onRemove(contact.id)}
        >
          ลบ
        </button>
      )}
    </div>
  );
}

export function VendorModal({ row, onClose, onSaved }) {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const [form, setForm] = useState(
    row || { code: "", name: "", contact: "", phone: "", email: "", remark: "", active: true }
  );
  const [contacts, setContacts] = useState(row?.contacts || []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const canEdit = auth.can("can_manage_suppliers");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (row) {
        await apiPatch(`/suppliers/${row.id}/`, form);
      } else {
        await apiPost("/suppliers/", form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addContact() {
    if (!row) return;
    setError("");
    try {
      const updated = await apiPost(`/suppliers/${row.id}/contacts/`, {
        name: "",
        role: "",
        phone: "",
        email: "",
      });
      setContacts(updated.contacts || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveContact(contactId, data) {
    if (!row) return;
    setError("");
    try {
      const updated = await apiPatch(`/suppliers/${row.id}/contacts/${contactId}/`, data);
      setContacts(updated.contacts || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeContact(contactId) {
    if (!row) return;
    const ok = await confirm("ลบ Contact นี้?", {
      title: "ยืนยันการลบ",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setError("");
    try {
      const updated = await apiDelete(`/suppliers/${row.id}/contacts/${contactId}/`);
      setContacts(updated.contacts || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={row ? "แก้ไข Vendor" : "เพิ่ม Vendor"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>Vendor Code *</span>
            <input required value={form.code} onChange={(e) => set("code", e.target.value)} />
          </label>
          <label className="field">
            <span>Vendor Name *</span>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="field">
            <span>Contact หลัก</span>
            <input value={form.contact || ""} onChange={(e) => set("contact", e.target.value)} />
          </label>
          <label className="field">
            <span>Phone หลัก</span>
            <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label className="field">
            <span>Email หลัก</span>
            <input value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="field span2">
            <span>Remark</span>
            <textarea rows="2" value={form.remark || ""} onChange={(e) => set("remark", e.target.value)} />
          </label>
        </div>

        <div className="section-label" style={{ marginTop: 18 }}>
          Contact เพิ่มเติม
        </div>
        {!row ? (
          <div className="helper">บันทึก Vendor ก่อน แล้วค่อยเพิ่ม Contact เพิ่มเติมได้</div>
        ) : (
          <>
            <div className="purchase-list">
              {contacts.length === 0 && (
                <div className="empty compact">ยังไม่มี Contact เพิ่มเติม</div>
              )}
              {contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  canEdit={canEdit}
                  onSave={saveContact}
                  onRemove={removeContact}
                />
              ))}
            </div>
            {canEdit && (
              <button type="button" className="btn ghost" onClick={addContact} style={{ marginTop: 8 }}>
                + เพิ่ม Contact
              </button>
            )}
          </>
        )}

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

export default function Vendors() {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(undefined);

  async function load() {
    try {
      const d = await apiGet("/suppliers/");
      setRows(d.results || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () => rows.filter((x) => !q || `${x.code} ${x.name}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  async function remove(x) {
    const ok = await confirm(`ยืนยันลบ Vendor ${x.code}?`, {
      title: "ยืนยันการลบ",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiDelete(`/suppliers/${x.id}/`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Vendor"
        subtitle="Vendor Master"
        actions={
          auth.can("can_manage_suppliers") && (
            <button className="btn primary" onClick={() => setModal(null)}>
              + เพิ่ม Vendor
            </button>
          )
        }
      />
      <Alert>{error}</Alert>
      <section className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา Vendor Code / Vendor Name..."
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor Code</th>
                <th>Vendor Name</th>
                <th>Contact หลัก</th>
                <th>Phone หลัก</th>
                <th>Email หลัก</th>
                <th>Contact เพิ่มเติม</th>
                <th>Status</th>
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
                  <td>{x.contact || "-"}</td>
                  <td>{x.phone || "-"}</td>
                  <td>{x.email || "-"}</td>
                  <td>
                    {(x.contacts || []).length > 0 ? (
                      <span className="status info">{x.contacts.length} คน</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <span className={`status ${x.active ? "success" : "muted"}`}>
                      {x.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {auth.can("can_manage_suppliers") && (
                      <div className="row-actions">
                        <button className="mini" onClick={() => setModal(x)}>
                          แก้ไข
                        </button>
                        <button className="mini danger" onClick={() => remove(x)}>
                          ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modal !== undefined && (
        <VendorModal row={modal} onClose={() => setModal(undefined)} onSaved={() => { setModal(undefined); load(); }} />
      )}
    </>
  );
}
