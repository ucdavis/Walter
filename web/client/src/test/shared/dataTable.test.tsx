import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/dataTable.tsx';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

type Row = { name: string; value: number };

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
];

describe('DataTable expandable overlay', () => {
  it('expands into an overlay and locks body scroll', async () => {
    const user = userEvent.setup();

    render(<DataTable columns={columns} data={[{ name: 'Row1', value: 1 }]} />);

    await user.click(screen.getByRole('button', { name: /expand table/i }));

    expect(
      screen.getByRole('button', { name: /collapse table/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('datatable-backdrop')).toBeInTheDocument();

    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
  });

  it('preserves filter, sorting, and pagination across expand/collapse', async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        data={[
          { name: 'Row1', value: 1 },
          { name: 'Row2', value: 2 },
        ]}
        initialState={{ pagination: { pageSize: 1 } }}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search all columns...');
    await user.type(searchInput, 'Row');

    await user.click(screen.getByRole('columnheader', { name: /^name$/i }));
    expect(screen.getByLabelText('Sorted ascending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Row2')).toBeInTheDocument();
    expect(screen.queryByText('Row1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand table/i }));
    await user.click(screen.getByRole('button', { name: /collapse table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /expand table/i })).toBeVisible()
    );

    expect(screen.getByPlaceholderText('Search all columns...')).toHaveValue(
      'Row'
    );
    expect(screen.getByLabelText('Sorted ascending')).toBeInTheDocument();
    expect(screen.getByText('Row2')).toBeInTheDocument();
    expect(screen.queryByText('Row1')).not.toBeInTheDocument();
  });

  it('closes on Escape or backdrop click and restores focus', async () => {
    const user = userEvent.setup();

    render(<DataTable columns={columns} data={[{ name: 'Row1', value: 1 }]} />);

    await user.click(screen.getByRole('button', { name: /expand table/i }));
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));

    await user.click(screen.getByTestId('datatable-backdrop'));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));

    const expandButtonAfterBackdropClose = screen.getByRole('button', {
      name: /expand table/i,
    });
    await waitFor(() => expect(expandButtonAfterBackdropClose).toHaveFocus());

    await user.click(expandButtonAfterBackdropClose);
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));

    const expandButtonAfterEscapeClose = screen.getByRole('button', {
      name: /expand table/i,
    });
    await waitFor(() => expect(expandButtonAfterEscapeClose).toHaveFocus());
  });
});

