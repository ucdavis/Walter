import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

describe('projects route', () => {
  it('renders the dashboard after fetching user and project data', async () => {
    const projects = [
      {
        activity_desc: 'Research',
        award_end_date: '2024-12-31',
        award_number: 'A-001',
        award_start_date: '2023-01-01',
        cat_bud_bal: 5000,
        cat_budget: 20_000,
        cat_commitments: 2500,
        cat_itd_exp: 12_500,
        copi: 'Co-PI 1',
        expenditure_category_name: 'Personnel',
        fund_desc: 'General Fund',
        pa: 'PA Team',
        pi: 'PI One',
        pm: 'PM One',
        program_desc: 'Science',
        project_name: 'Alpha Project',
        project_number: 'PRJ-001',
        project_owning_org: 'Org A',
        project_status_code: 'ACTIVE',
        purpose_desc: 'Discovery',
        task_name: 'Task A',
        task_num: '1',
        task_status: 'ACTIVE',
      },
      {
        activity_desc: 'Research',
        award_end_date: '2025-06-30',
        award_number: 'A-001',
        award_start_date: '2023-01-01',
        cat_bud_bal: 3000,
        cat_budget: 15_000,
        cat_commitments: 1500,
        cat_itd_exp: 10_500,
        copi: 'Co-PI 1',
        expenditure_category_name: 'Operations',
        fund_desc: 'General Fund',
        pa: 'PA Team',
        pi: 'PI One',
        pm: 'PM One',
        program_desc: 'Science',
        project_name: 'Alpha Project',
        project_number: 'PRJ-001',
        project_owning_org: 'Org A',
        project_status_code: 'ACTIVE',
        purpose_desc: 'Discovery',
        task_name: 'Task B',
        task_num: '2',
        task_status: 'ACTIVE',
      },
    ];

    const user = {
      email: 'alpha@example.com',
      id: 'user-1',
      name: 'Alpha User',
      roles: ['admin'],
    };

    let projectRequestCount = 0;
    let userRequestCount = 0;

    server.use(
      http.get('/api/project', () => {
        projectRequestCount += 1;
        return HttpResponse.json(projects);
      }),
      http.get('/api/user/me', () => {
        userRequestCount += 1;
        return HttpResponse.json(user);
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/projects' });

    try {
      expect(
        await screen.findByText('All Projects Dashboard')
      ).toBeInTheDocument();
      expect(projectRequestCount).toBe(1);
      expect(userRequestCount).toBe(1);
    } finally {
      cleanup();
    }
  });
});
