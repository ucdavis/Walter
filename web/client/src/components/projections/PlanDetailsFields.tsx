import {
  FORECAST_MONTH_OPTIONS,
  MAX_PLAN_NOTES_LENGTH,
} from '@/lib/projectionDetails.ts';

export function PlanDurationField({
  onChange,
  value,
}: {
  onChange: (months: number) => void;
  value: number;
}) {
  return (
    <div className="max-w-xs space-y-2">
      <label className="flex flex-col gap-2">
        Forecast duration
        <select
          className="select select-bordered w-full"
          onChange={(event) => onChange(Number(event.target.value))}
          value={value}
        >
          {FORECAST_MONTH_OPTIONS.map((months) => (
            <option key={months} value={months}>
              {months} months
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">Starts in the original snapshot month.</p>
    </div>
  );
}

export function PlanNotesField({
  disabled,
  label = 'Plan notes (optional)',
  onChange,
  rows = 4,
  value,
}: {
  disabled?: boolean;
  label?: string;
  onChange: (notes: string) => void;
  rows?: number;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-2">
        {label}
        <textarea
          className="textarea textarea-bordered w-full"
          disabled={disabled}
          maxLength={MAX_PLAN_NOTES_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          value={value}
        />
      </label>
      <p className="text-sm">
        Visible to everyone who can view this plan. Up to{' '}
        {MAX_PLAN_NOTES_LENGTH.toLocaleString()} characters.
      </p>
    </div>
  );
}
