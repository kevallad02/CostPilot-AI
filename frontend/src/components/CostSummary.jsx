function fmt(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function CostSummary({ summary, isOpen, onClose }) {
  const grouped = (summary?.items || []).reduce((acc, row) => {
    if (!acc[row.item_name]) acc[row.item_name] = { ...row, total_cost: 0 };
    acc[row.item_name].total_cost += Number(row.total_cost);
    return acc;
  }, {});

  const hasItems = Object.keys(grouped).length > 0;

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 className="sidebar-heading" style={{ margin: 0 }}>Project Estimate</h3>
        {/* Close button – only visible on mobile (sidebar is full-width bottom sheet) */}
        <button
          onClick={onClose}
          style={{
            display: 'none', // shown via media query override below
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            color: '#64748b',
            lineHeight: 1,
          }}
          className="sidebar-close-btn"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {!hasItems ? (
        <p className="sidebar-empty">No items yet.<br />Start by typing a query.</p>
      ) : (
        <>
          <div className="sidebar-items">
            {Object.values(grouped).map((item) => (
              <div key={item.item_name} className="sidebar-row">
                <div className="sidebar-row-name">{item.item_name}</div>
                <div className="sidebar-row-meta">
                  {item.quantity} {item.unit} × {fmt(item.unit_rate)}
                </div>
                <div className="sidebar-row-cost">{fmt(item.total_cost)}</div>
              </div>
            ))}
          </div>
          <div className="sidebar-total">
            <span className="sidebar-total-label">Total</span>
            <span className="sidebar-total-value">{fmt(summary.total)}</span>
          </div>
        </>
      )}
    </aside>
  );
}
