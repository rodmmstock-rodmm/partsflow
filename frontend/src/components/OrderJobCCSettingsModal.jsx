import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { Alert, Modal } from "./Common";

export default function OrderJobCCSettingsModal({ jobs, onClose }) {
  const [rules, setRules] = useState([]);
  const [job, setJob] = useState(jobs?.[0] || "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await apiGet("/rfq-cc-rules/", { forceRefresh: true, cache: false });
      setRules((result.results || []).filter((row) => row.rule_type === "JOB"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedJobRules = rules.filter(
    (row) => String(row.job || "").trim().toUpperCase() === String(job || "").trim().toUpperCase()
  );

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // The rule is unique per Job + email, so the same address can be
      // assigned independently to multiple Jobs.
      await apiPost("/rfq-cc-rules/", { rule_type: "JOB", job, email });
      setEmail("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    setBusy(true);
    setError("");
    try {
      await apiDelete("/rfq-cc-rules/" + row.id + "/");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ตั้งค่าอีเมล CC ตาม JOB" onClose={onClose} wide>
      <div className="alert info">ระบบจะนำอีเมล CC ของ JOB ในแต่ละ Order ไปใส่ใน Gmail อัตโนมัติ โดยยังคง CC จาก Vendor ไว้ด้วย</div>
      <form onSubmit={add}>
        <div className="form-grid">
          <label className="field">
            <span>JOB</span>
            <select value={job} onChange={(event) => setJob(event.target.value)} required>
              {jobs.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="field">
            <span>อีเมล CC</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required />
          </label>
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button className="btn primary" disabled={busy || !job || !email.trim()}>เพิ่ม CC</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th colSpan="2">อีเมล CC ของ JOB: {job || "-"}</th></tr>
            <tr><th>อีเมล CC</th><th></th></tr>
          </thead>
          <tbody>
            {selectedJobRules.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td><button type="button" className="mini danger" disabled={busy} onClick={() => remove(row)}>ลบ</button></td>
              </tr>
            ))}
            {!selectedJobRules.length && (
              <tr><td colSpan="2">ยังไม่มีอีเมล CC สำหรับ JOB นี้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
