export default function PlanningPeriodSelect({
  months,
  onChange,
}: {
  months: number;
  onChange: (months: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
      Planning period
      <select
        className="select w-full text-base"
        onChange={(event) => onChange(Number(event.target.value))}
        value={months}
      >
        <option value={6}>Next 6 months</option>
        <option value={12}>Next 12 months</option>
        <option value={18}>Next 18 months</option>
      </select>
    </label>
  );
}
