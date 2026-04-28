import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Default handlers cover ambient app fetches that fire on most pages and
// otherwise force every test to opt in. Tests that want to assert against
// these endpoints can still override via `server.use(...)`.
const defaultHandlers = [
  http.get('/api/notification', () =>
    HttpResponse.json({ enabled: false, message: '', updatedOn: null })
  ),
];

// Create a shared MSW server instance that can be used across all tests
export const testServer = setupServer(...defaultHandlers);

// Global setup for MSW server
// This will be automatically called when imported in test files
beforeAll(() => {
  testServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  testServer.resetHandlers();
});

afterAll(() => {
  testServer.close();
});

export { testServer as server };
