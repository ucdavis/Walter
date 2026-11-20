import { useFieldContext } from './formContext.tsx';
import { FieldWrapper } from './FieldWrapper.tsx';
import { useId } from 'react';

interface SelectFieldProps {
  label: string;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
}

export function SelectField({ label, options, placeholder }: SelectFieldProps) {
  const field = useFieldContext<string>();
  const inputId = useId();
  const hasError = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FieldWrapper inputId={inputId} label={label}>
      <select
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        aria-invalid={hasError}
        className={`select select-bordered w-full ${
          hasError ? 'select-error' : ''
        }`}
        id={inputId}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        value={field.state.value || ''}
      >
        <option disabled value="">
          {placeholder ?? `Pick a ${label.toLowerCase()}`}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
