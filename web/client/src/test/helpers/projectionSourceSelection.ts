import { screen, within } from '@testing-library/react';
import type { userEvent } from '@testing-library/user-event';

/** Select the projects a scenario needs rather than relying on seed defaults. */
export async function chooseInitialProjects(
  user: ReturnType<typeof userEvent.setup>,
  projects: string[]
) {
  const search = await screen.findByRole('searchbox', {
    name: 'Search funding sources',
  });
  for (const project of projects) {
    await user.clear(search);
    await user.type(search, project);
    const results = screen.getByRole('region', {
      name: `${project} search results`,
    });
    await user.click(
      within(results).getByRole('button', {
        name: /^(Add all \d+ tasks|Add source)$/,
      })
    );
  }
  await user.clear(search);
}
