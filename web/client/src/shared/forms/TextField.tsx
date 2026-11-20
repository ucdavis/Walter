import { useFieldContext } from './formContext.tsx';
import { FieldWrapper } from './FieldWrapper.tsx';
import { useId } from 'react';

interface TextFieldProps {
  label: string;
  placeholder?: string;
}

export function TextField({ label, placeholder }: TextFieldProps) {
  const field = useFieldContext<string>();
  const inputId = useId();
  const hasError = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FieldWrapper inputId={inputId} label={label}>
      <input
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        aria-invalid={hasError}
        className={`input input-bordered w-full ${
          hasError ? 'input-error' : ''
        }`}
        id={inputId}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        type="text"
        value={field.state.value}
      />
    </FieldWrapper>
  );
}
