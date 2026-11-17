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
    <div className="space-y-2">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Forecast duration
        <select
          className="select w-full text-base font-normal"
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
      <p className="text-xs text-base-content/60">
        Starts in the original snapshot month.
      </p>
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
      <label className="flex flex-col gap-2 text-sm font-medium">
        {label}
        <textarea
          className="textarea min-h-10 w-full text-base font-normal"
          disabled={disabled}
          maxLength={MAX_PLAN_NOTES_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          value={value}
        />
      </label>
      <p className="text-xs text-base-content/60">
        Visible to everyone who can view this plan. Up to{' '}
        {MAX_PLAN_NOTES_LENGTH.toLocaleString()} characters.
      </p>
    </div>
  );
}
