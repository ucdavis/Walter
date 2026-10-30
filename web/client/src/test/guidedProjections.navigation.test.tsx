import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';
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
    fireEvent.change(screen.getByLabelText('Indirect rate %'), {
      target: { value: '35' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2027-06-30' },
    });
    fireEvent.change(screen.getByLabelText('Available balance'), {
      target: { value: '125000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
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
      screen.getByLabelText('Future grant available balance')
    ).toHaveTextContent('$125,000');
    section('Expenses');
    expect(screen.getByLabelText('Funding project')).toHaveDisplayValue(
      'Future grant'
    );
  });

  it('removes source allocations from the workspace and keeps them removed after reloading', () => {
    const source = createProjectionDemoPlan(createDemoData(17, '2026-01'))
      .fundingSources[0];
    const view = renderPlans();
    openDefault();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).getByRole('button', { name: 'Funding' })
    );
    fireEvent.click(
      within(screen.getByRole('article', { name: source.name })).getByRole(
        'button',
        { name: 'Edit details' }
      )
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove funding source' })
    );
    const stored = JSON.parse(
      localStorage.getItem(localStorage.key(0)!)!
    ) as ProjectionPlan[];
    const plan = stored.find((row) => row.id === 'walter-default-plan')!;
    expect(plan.funding.some((fund) => fund.id === source.id)).toBe(false);
    expect(plan.selectedFunding).not.toContain(source.id);
    expect(
      plan.staff.some((person) =>
        person.splits.some((split) => split.fundingId === source.id)
      )
    ).toBe(false);
    expect(
      plan.expenses.some((expense) => expense.fundingId === source.id)
    ).toBe(false);
    view.unmount();
    renderPlans();
    openDefault();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).getByRole('button', { name: 'Funding' })
    );
    expect(
      screen.queryByRole('article', { name: source.name })
    ).not.toBeInTheDocument();
  });

  it('shows the sidebar on the dashboard and hides it during setup', () => {
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
      expect(
        screen.queryByRole('complementary', { name: 'Projection plans' })
      ).not.toBeInTheDocument();
    }
    createFromSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
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
    expect(
      screen.queryByRole('complementary', { name: 'Projection plans' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Plan navigation' })
      ).getByRole('button', { name: /Next field season/ })
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Next field season'
    );
    expect(
      screen.queryByRole('complementary', { name: 'Projection plans' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
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
    expect(
      within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).queryByRole('button', { name: 'Plan details' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(
      screen.getByRole('dialog', { name: 'Plan details' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Plan name'), {
      target: { value: 'Canceled plan name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Default plan'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    fireEvent.change(screen.getByLabelText('Plan name'), {
      target: { value: 'My baseline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate plan' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'My baseline copy'
    );
    view.unmount();
    renderPlans();
    const navigation = within(
      screen.getByRole('navigation', { name: 'Plan navigation' })
    );
    expect(
      navigation.getByRole('button', { name: /My baseline\s*Default plan/ })
    ).toBeInTheDocument();
    fireEvent.click(
      navigation.getByRole('button', { name: /My baseline copy/ })
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'My baseline copy'
    );
  });
});
