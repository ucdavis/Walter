import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const user = {
  email: 'test@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles: [],
};

describe('help route', () => {
  it('shows support resources in the expected order', async () => {
    server.use(http.get('/api/user/me', () => HttpResponse.json(user)));

    const { cleanup } = renderRoute({ initialPath: '/help' });

    try {
      await screen.findByRole('heading', { level: 1, name: 'Help' });

      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings.map((heading) => heading.textContent)).toEqual([
        'Knowledge Base (Coming Soon)',
        'Help',
        'Feedback',
      ]);

      const knowledgeBaseCard = headings[0].closest('section');
      const helpCard = headings[1].closest('section');
      const feedbackCard = headings[2].closest('section');

      expect(knowledgeBaseCard).not.toBeNull();
      expect(helpCard).not.toBeNull();
      expect(feedbackCard).not.toBeNull();

      expect(
        within(knowledgeBaseCard!).getByRole('link', {
          name: 'Open Knowledge Base (Coming Soon)',
        })
      ).toHaveAttribute(
        'href',
        'https://computing.caes.ucdavis.edu/documentation/walter'
      );
      expect(
        within(helpCard!).getByRole('link', {
          name: 'Open Help',
        })
      ).toHaveAttribute('href', 'https://caeshelp.ucdavis.edu/?appname=Walter');
      expect(
        within(feedbackCard!).getByRole('link', {
          name: 'Open Feedback',
        })
      ).toHaveAttribute('href', 'https://feedback.ucdavis.edu/app/walter');
    } finally {
      cleanup();
    }
  });
});
