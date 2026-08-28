export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal-card ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({ type = "error", children }) {
  if (!children) return null;
  return <div className={`alert ${type}`}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = "ค้นหา..." }) {
  return <input className="search-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export function DatalistInput({ label, value, onChange, options, getLabel, required = false, placeholder = "พิมพ์เพื่อค้นหา..." }) {
  const id = `dl-${label.replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} />
      <datalist id={id}>
        {options.map((x) => <option key={x.id || getLabel(x)} value={getLabel(x)} />)}
      </datalist>
    </label>
  );
}

export function Empty({ text = "ไม่พบข้อมูล" }) {
  return <div className="empty">{text}</div>;
}

export const fmt = (v) => Number(v || 0).toLocaleString("th-TH");
export const money = (v) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
