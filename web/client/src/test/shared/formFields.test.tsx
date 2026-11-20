import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { z } from 'zod';
import { useAppForm } from '@/shared/forms/formContext.tsx';

afterEach(cleanup);

function Fields() {
  const form = useAppForm({ defaultValues: { name: '', role: '' } });
  return (
    <>
      <form.AppField
        name="name"
        validators={{ onBlur: z.string().min(1, 'Enter a name') }}
      >
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <form.AppField name="role">
        {(field) => (
          <field.SelectField
            label="Role"
            options={[{ label: 'Manager', value: 'manager' }]}
          />
        )}
      </form.AppField>
    </>
  );
}

describe('shared form field accessibility', () => {
  it('connects visible labels to text and select fields', async () => {
    const user = userEvent.setup();
    render(<Fields />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(screen.getByText('Name', { exact: true }));
    expect(input).toHaveFocus();
    await user.type(input, 'Alex');
    expect(input).toHaveValue('Alex');
    const select = screen.getByRole('combobox', { name: 'Role' });
    await user.click(screen.getByText('Role', { exact: true }));
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'manager');
    expect(select).toHaveValue('manager');
  });

  it('associates validation errors with the invalid field', async () => {
    const user = userEvent.setup();
    render(<Fields />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    await user.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a name');
  });
});
