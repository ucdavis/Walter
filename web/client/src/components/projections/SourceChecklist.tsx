export interface SourceChoice {
  disabled?: boolean;
  key: string;
  label: string;
  projectName: string;
  projectNumber: string | null;
}

/** Project checkboxes select tasks together; each task retains its own source identity. */
export function SourceChecklist({
  choices,
  onChange,
  selected,
}: {
  choices: SourceChoice[];
  onChange: (keys: string[]) => void;
  selected: string[];
}) {
  const selectedKeys = new Set(selected);
  const groups = new Map<string, SourceChoice[]>();
  for (const choice of choices) {
    const key = choice.projectNumber
      ? `project:${choice.projectNumber}`
      : `planned:${choice.key}`;
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  function toggle(keys: string[], checked: boolean) {
    const next = new Set(selected);
    for (const key of keys) {
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    onChange([...next]);
  }
  const task = (choice: SourceChoice) => (
    <label className="flex items-start gap-3 py-2" key={choice.key}>
      <input
        aria-label={`Include ${choice.label}`}
        checked={selectedKeys.has(choice.key)}
        className="checkbox checkbox-sm mt-0.5"
        disabled={choice.disabled}
        onChange={(event) => toggle([choice.key], event.target.checked)}
        type="checkbox"
      />
      <span>
        {choice.label}
        {choice.disabled && (
          <span className="ml-2 text-sm">Already included</span>
        )}
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([key, group]) => {
        if (group.length === 1) {
          return (
            <div className="rounded-box border border-base-300 px-4" key={key}>
              {task(group[0])}
            </div>
          );
        }
        const available = group.filter((choice) => !choice.disabled);
        const checked =
          available.length > 0 &&
          available.every((choice) => selectedKeys.has(choice.key));
        const partial =
          !checked && available.some((choice) => selectedKeys.has(choice.key));
        return (
          <div className="rounded-box border border-base-300 p-4" key={key}>
            <label className="flex items-center gap-3 font-semibold">
              <input
                aria-label={`Include project ${group[0].projectName}`}
                checked={checked}
                className="checkbox checkbox-sm"
                disabled={available.length === 0}
                onChange={(event) =>
                  toggle(
                    available.map((choice) => choice.key),
                    event.target.checked
                  )
                }
                ref={(element) => {
                  if (element) {
                    element.indeterminate = partial;
                  }
                }}
                type="checkbox"
              />
              {group[0].projectName}
            </label>
            <details className="mt-2" open>
              <summary className="cursor-pointer text-sm">
                Tasks ({group.length})
              </summary>
              <div className="ml-4 mt-2">{group.map(task)}</div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
