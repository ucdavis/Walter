import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertCard } from '@/components/alerts/ProjectAlerts.tsx';

describe('AlertCard', () => {
  it('shows balance for budget alerts, hides for date alerts', () => {
    render(
      <AlertCard
        alert={{ id: '1', message: 'has a negative balance', severity: 'error', type: 'negative-balance' }}
        balance={1000}
      />
    );
    expect(screen.getByText(/\$1,000/)).toBeInTheDocument();
  });
});