import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FundingSourceCard } from '@/components/projections/FundingSourceCard.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

afterEach(cleanup);

describe('funding availability in cards', () => {
  it.each([
    {
      endDate: null,
      outside: false,
      startDate: '2026-03-01',
      text: 'Available from Mar 2026',
    },
    {
      endDate: null,
      outside: true,
      startDate: '2027-01-01',
      text: 'Available from Jan 2027',
    },
    {
      endDate: '2025-12-31',
      outside: true,
      startDate: '2025-01-01',
      text: null,
    },
    { endDate: null, outside: false, startDate: '2025-01-01', text: null },
  ])(
    'shows effective availability for $startDate through $endDate',
    ({ endDate, outside, startDate, text }) => {
      const source = createSalaryExample().content.fundingSources[0];
      source.startDate = startDate;
      source.endDate = endDate;
      render(
        <FundingSourceCard
          colorIndex={0}
          forecastWindow={{ endMonth: '2026-12', startMonth: '2026-01' }}
          onEdit={vi.fn()}
          source={source}
        />
      );
      if (text) {
        expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
      } else {
        expect(screen.queryByText(/Available from/)).not.toBeInTheDocument();
      }
      if (outside) {
        expect(screen.getByText(/Outside this forecast/)).toBeInTheDocument();
      } else {
        expect(
          screen.queryByText(/Outside this forecast/)
        ).not.toBeInTheDocument();
      }
      expect(
        screen.getByText(
          text || outside ? 'Planning balance' : 'Available balance'
        )
      ).toBeInTheDocument();
    }
  );
});
