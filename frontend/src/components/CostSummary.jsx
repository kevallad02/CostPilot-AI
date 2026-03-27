/**
 * CostSummary – sidebar panel showing live running total.
 */
function fmt(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function CostSummary({ summary }) {
  if (!summary || summary.items.length === 0) {
    return (
      <aside style={sidebarStyle}>
        <h3 style={headingStyle}>Project Estimate</h3>
        <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          No items yet.<br />Start by typing a query.
        </p>
      </aside>
    );
  }

  // Group by item name (sum quantities + costs if same item added multiple times)
  const grouped = summary.items.reduce((acc, row) => {
    if (!acc[row.item_name]) {
      acc[row.item_name] = { ...row, total_cost: 0 };
    }
    acc[row.item_name].total_cost += Number(row.total_cost);
    return acc;
  }, {});

  return (
    <aside style={sidebarStyle}>
      <h3 style={headingStyle}>Project Estimate</h3>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {Object.values(grouped).map((item) => (
          <div key={item.item_name} style={rowStyle}>
            <div style={{ fontWeight: 500, textTransform: 'capitalize', fontSize: 14 }}>
              {item.item_name}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {item.quantity} {item.unit} × {fmt(item.unit_rate)}
            </div>
            <div style={{ fontWeight: 600, color: '#2563eb', fontSize: 14, marginTop: 2 }}>
              {fmt(item.total_cost)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: '2px solid #e2e8f0',
          paddingTop: 12,
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Total</span>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#2563eb' }}>
          {fmt(summary.total)}
        </span>
      </div>
    </aside>
  );
}

const sidebarStyle = {
  width: 280,
  flexShrink: 0,
  background: '#fff',
  borderLeft: '1px solid #e2e8f0',
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  overflowY: 'auto',
};

const headingStyle = {
  margin: '0 0 16px 0',
  fontSize: 16,
  fontWeight: 600,
  color: '#1e293b',
};

const rowStyle = {
  padding: '10px 0',
  borderBottom: '1px solid #f1f5f9',
};
