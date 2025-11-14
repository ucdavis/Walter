const expenditures = [
  {
    balance: 4293.08,
    budget: 29_486.0,
    category: 'Salaries and Wages',
    encumbrance: 0.0,
    expense: 25_193.08,
    icon: '👤',
  },
  {
    balance: 3.0,
    budget: 12_569.0,
    category: 'Fringe Benefits',
    encumbrance: 0.0,
    expense: 9598.2,
    icon: '🎁',
  },
  {
    balance: 9612.0,
    budget: 117_244.82,
    category: 'Supplies / Services / Other Expenses',
    encumbrance: 0.0,
    expense: 108_121.0,
    icon: '📦',
  },
  {
    balance: 0.0,
    budget: 0.0,
    category: 'Contract (Subcontracts)',
    encumbrance: 0.0,
    expense: 0.0,
    icon: '📄',
  },
  {
    balance: 10_523.51,
    budget: 41_038.0,
    category: 'Travel',
    encumbrance: 0.0,
    expense: 25_323.61,
    icon: '✈️',
  },
  {
    balance: 8523.51,
    budget: 20_750.18,
    category: 'Indirect Costs',
    encumbrance: 0.0,
    expense: 17_523.51,
    icon: '💰',
  },
];

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export function FinancialDetails() {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="mb-4">Financial Details</h2>
      <div className="flex gap-8 mb-6">
        <div>
          <div className="text-sm text-gray-500 mb-1">Budget</div>
          <div>$221,051.00</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Current Balance</div>
          <div>$30,719.77</div>
        </div>
      </div>
      <div className="flex justify-end mb-4">
        <button className="btn btn-outline btn-sm">
          <span className="mr-2">📄</span>
          View More
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600">
                Expenditure category name
              </th>
              <th className="text-right px-4 py-3 text-gray-600">Budget</th>
              <th className="text-right px-4 py-3 text-gray-600">Expense</th>
              <th className="text-right px-4 py-3 text-gray-600">
                Encumbrance
              </th>
              <th className="text-right px-4 py-3 text-gray-600">Balance</th>
            </tr>
          </thead>
          <tbody>
            {expenditures.map((item, index) => (
              <tr className="border-t border-gray-200" key={index}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span>{item.category}</span>
                  </div>
                </td>
                <td className="text-right px-4 py-3">
                  {formatCurrency(item.budget)}
                </td>
                <td className="text-right px-4 py-3">
                  {formatCurrency(item.expense)}
                </td>
                <td className="text-right px-4 py-3">
                  {formatCurrency(item.encumbrance)}
                </td>
                <td className="text-right px-4 py-3">
                  {formatCurrency(item.balance)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="px-4 py-3 font-semibold">TOTALS</td>
              <td className="text-right px-4 py-3">$221,051.00</td>
              <td className="text-right px-4 py-3">$185,759.77</td>
              <td className="text-right px-4 py-3">$0.01</td>
              <td className="text-right px-4 py-3">$30,719.77</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
