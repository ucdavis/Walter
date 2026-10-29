import { useState } from 'react';
import { format } from 'date-fns';
import { DayPicker } from '@daypicker/react';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { parseProjectDate } from '@/lib/date.ts';
import '@daypicker/react/style.css';

interface DatePickerProps {
  id: string;
  label: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function DatePicker({
  id,
  label,
  max,
  min,
  onChange,
  placeholder = 'Any date',
  value,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseProjectDate(value) ?? undefined;
  const minDate = parseProjectDate(min ?? '');
  const maxDate = parseProjectDate(max ?? '');
  const {
    context,
    floatingStyles,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    onOpenChange: setOpen,
    open,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  return (
    <div className="w-full sm:w-48">
      <label
        className="mb-2 block text-sm font-medium text-base-content"
        htmlFor={id}
        id={`${id}-label`}
      >
        {label}
      </label>
      <button
        aria-labelledby={`${id}-label ${id}-value`}
        className="input min-h-11 w-full cursor-pointer justify-between gap-2 border-main-border bg-base-100 text-base focus:border-primary focus:outline-primary"
        id={id}
        ref={setReference}
        type="button"
        {...getReferenceProps()}
      >
        <span
          className={selected ? 'text-base-content' : 'text-base-content/50'}
          id={`${id}-value`}
        >
          {selected ? format(selected, 'MM/dd/yyyy') : placeholder}
        </span>
        <CalendarDaysIcon className="size-5 shrink-0 text-base-content/70" />
      </button>
      {open ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              aria-label={`Choose ${label.toLowerCase()} date`}
              className="z-[100] max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-auto rounded-box border border-main-border bg-base-100 p-3 text-base-content shadow-lg"
              ref={setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <DayPicker
                autoFocus
                className="font-sans [--rdp-accent-background-color:var(--color-base-200)] [--rdp-accent-color:var(--color-primary)] [--rdp-day_button-height:2.5rem] [--rdp-day_button-width:2.5rem] [--rdp-day-height:2.5rem] [--rdp-day-width:2.5rem]"
                classNames={{
                  day_button:
                    'size-10 rounded-field text-sm hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary',
                  selected:
                    'rounded-field bg-primary text-primary-content font-semibold',
                  today: 'font-semibold',
                }}
                defaultMonth={selected ?? maxDate ?? minDate ?? undefined}
                disabled={[
                  ...(minDate ? [{ before: minDate }] : []),
                  ...(maxDate ? [{ after: maxDate }] : []),
                ]}
                mode="single"
                onSelect={(date: Date | undefined) => {
                  // Filter dates stay local date-only strings, without a UTC conversion.
                  onChange(date ? format(date, 'yyyy-MM-dd') : '');
                  setOpen(false);
                }}
                selected={selected}
              />
              <div className="mt-3 flex justify-end border-t border-main-border pt-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  type="button"
                >
                  Clear date
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
