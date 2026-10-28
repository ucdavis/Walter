import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuidedProjections from '@/components/guidedProjections/GuidedProjections.tsx';
import { createDemoData } from '@/demo/data.ts';
import { createProjectionDemoPlan } from '@/demo/projectionPlan.ts';

vi.mock('@/components/guidedProjections/ProjectOutlook.tsx', () => ({
  LiveResults: () => <div>Live results</div>,
  ProjectDetail: () => <div>Project detail</div>,
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderPlans() {
  return render(
    <GuidedProjections
      initialPlan={createProjectionDemoPlan(createDemoData(17, '2026-01'))}
    />
  );
}

function openDefault() {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Plan navigation' })
    ).getByRole('button', { name: /Default plan/ })
  );
}

describe('Guided projection plan navigation', () => {
  it('adds planned funding, makes it available to expenses, and retains edits after reloading', () => {
    const view = renderPlans();
    openDefault();
    const section = (name: string) =>
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Plan sections' })
        ).getByRole('button', { name })
      );
    section('Funding');
    fireEvent.click(screen.getByRole('button', { name: 'Add funding source' }));
    expect(screen.getByLabelText('Funding source name')).toHaveFocus();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-12-31');
    fireEvent.change(screen.getByLabelText('Funding source name'), {
      target: { value: 'Future grant' },
    });
    fireEvent.change(screen.getByLabelText('Future grant starting balance'), {
      target: { value: '125000' },
    });
    fireEvent.change(screen.getByLabelText('Indirect rate %'), {
      target: { value: '35' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2027-06-30' },
    });
    expect(
      screen.getByRole('checkbox', { name: /Future grant/ })
    ).toBeChecked();
    section('Expenses');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.change(screen.getByLabelText('Funding project'), {
      target: {
        value: screen
          .getByRole('option', { name: 'Future grant' })
          .getAttribute('value'),
      },
    });
    expect(screen.getByLabelText('Funding project')).toHaveDisplayValue(
      'Future grant'
    );
    view.unmount();
    renderPlans();
    openDefault();
    section('Funding');
    expect(
      screen.getByRole('checkbox', { name: /Include Future grant/ })
    ).toBeChecked();
    expect(screen.getByLabelText('Future grant starting balance')).toHaveValue(
      125_000
    );
    section('Expenses');
    expect(screen.getByLabelText('Funding project')).toHaveDisplayValue(
      'Future grant'
    );
  });

  it('starts plan setup from the sidebar on the homepage and in a plan', () => {
    renderPlans();
    function createFromSidebar() {
      fireEvent.click(
        within(
          screen.getByRole('complementary', { name: 'Projection plans' })
        ).getByRole('button', { name: 'Create New Plan' })
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Choose your starting point.'
      );
    }
    createFromSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
    openDefault();
    createFromSidebar();
  });

  it('switches between the default and saved plans and returns home', () => {
    renderPlans();
    expect(
      screen.getByRole('complementary', { name: 'Projection plans' })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Plan navigation' })
      ).getByRole('button', { name: 'Dashboard' })
    ).toHaveAttribute('aria-current', 'page');
    openDefault();
    const navigation = within(
      screen.getByRole('navigation', { name: 'Plan navigation' })
    );
    expect(
      navigation.getByRole('button', { name: /Default plan/ })
    ).toHaveAttribute('aria-current', 'page');
    fireEvent.click(
      navigation.getByRole('button', { name: /Next field season/ })
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Next field season'
    );
    expect(
      navigation.getByRole('button', { name: /Next field season/ })
    ).toHaveAttribute('aria-current', 'page');
    fireEvent.click(navigation.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "Morgan Reed's Projections"
    );
    expect(
      screen.getByRole('complementary', { name: 'Projection plans' })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Plan navigation' })
      ).getByRole('button', { name: 'Dashboard' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps default-plan edits and duplicates available after reloading', () => {
    const view = renderPlans();
    openDefault();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).getByRole('button', { name: 'Plan details' })
    );
    fireEvent.change(screen.getByLabelText('Plan name'), {
      target: { value: 'My baseline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate plan' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'My baseline copy'
    );
    view.unmount();
    renderPlans();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Plan navigation' })
      ).getByRole('button', { name: /My baseline copy/ })
    );
    const navigation = within(
      screen.getByRole('navigation', { name: 'Plan navigation' })
    );
    expect(
      navigation.getByRole('button', { name: /My baseline\s*Default plan/ })
    ).toBeInTheDocument();
    expect(
      navigation.getByRole('button', { name: /My baseline copy/ })
    ).toHaveAttribute('aria-current', 'page');
  });
});
