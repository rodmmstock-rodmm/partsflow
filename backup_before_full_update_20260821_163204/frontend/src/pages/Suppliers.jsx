import { useEffect, useState } from "react";
import { apiGet } from "../api";

function resultsOf(payload) {
  return Array.isArray(payload) ? payload : payload?.results || [];
}

export default function Suppliers() {
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

      const payload = await apiGet(`/suppliers/?${params.toString()}`);
      const results = resultsOf(payload);

      setRows(results);
      setCount(payload?.count ?? results.length);
    } catch (err) {
      setError(err.message || "โหลด Supplier ไม่สำเร็จ");
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
          <h2>Suppliers</h2>
          <p>Supplier Master {count ? `· ${count.toLocaleString()} ราย` : ""}</p>
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
            placeholder="ค้นหา Supplier / Code / Contact"
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
                  <th>Code</th>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.code || supplier.supplier_code || "-"}</td>
                    <td>
                      <strong>{supplier.name || supplier.supplier_name || "-"}</strong>
                    </td>
                    <td>{supplier.contact_name || supplier.contact || "-"}</td>
                    <td>{supplier.phone || supplier.tel || "-"}</td>
                    <td>{supplier.email || "-"}</td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan="5" className="empty">
                      ไม่พบ Supplier
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
