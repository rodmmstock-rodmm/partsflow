import { useEffect, useState } from "react";
import { apiGet } from "../api";

function resultsOf(payload) {
  return Array.isArray(payload) ? payload : payload?.results || [];
}

export default function Machines() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(search = q) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search.trim()) params.set("q", search.trim());

      const payload = await apiGet(`/machines/?${params.toString()}`);
      const results = resultsOf(payload);

      setRows(results);
      setCount(payload?.count ?? results.length);
    } catch (err) {
      setError(err.message || "โหลด Machine ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Machines</h2>
          <p>Machine Master {count ? `· ${count.toLocaleString()} เครื่อง` : ""}</p>
        </div>
      </div>

      <section className="panel">
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา Machine Code / Name / Alias"
          />
          <button type="submit">Search</button>
        </form>

        {error && <div className="pf-login-error">{error}</div>}

        {loading ? (
          <div className="empty">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Machine Code</th>
                  <th>Machine Name</th>
                  <th>Area / Location</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((machine) => (
                  <tr key={machine.id}>
                    <td>
                      <strong>
                        {machine.code ||
                          machine.machine_code ||
                          machine.current_code ||
                          "-"}
                      </strong>
                    </td>
                    <td>{machine.name || machine.machine_name || "-"}</td>
                    <td>
                      {machine.area ||
                        machine.location ||
                        machine.department ||
                        "-"}
                    </td>
                    <td>{machine.active === false ? "Inactive" : "Active"}</td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan="4" className="empty">
                      ไม่พบ Machine
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
