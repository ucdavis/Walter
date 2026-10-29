import { http, HttpResponse } from 'msw';
import type { DemoData } from './data.ts';

const unavailable = () =>
  HttpResponse.json(
    { message: 'This action is not included in the local demo.' },
    { status: 404 }
  );

export function createDemoHandlers(data: DemoData) {
  const projectNumbers = new Set(data.projects.map((p) => p.projectNumber));
  const catalog = [...projectNumbers].map((projectNumber) => ({
    keywords: [data.user.name, 'demo'],
    projectName: data.projects.find((p) => p.projectNumber === projectNumber)!
      .projectName,
    projectNumber,
    projectPiIamId: data.user.iamId,
  }));
  const selectedProjects = (request: Request) =>
    new Set(
      new URL(request.url).searchParams.get('projectCodes')?.split(',') ?? []
    );

  return [
    http.get('/api/user/me', () => HttpResponse.json(data.user)),
    http.get(
      '/api/user/me/photo',
      () =>
        new HttpResponse(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#002855"/><text x="40" y="51" text-anchor="middle" fill="#ffbf00" font-family="sans-serif" font-size="30">MR</text></svg>',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        )
    ),
    http.get('/api/system/features', () =>
      HttpResponse.json({
        burndownEnabled: true,
        expenditureProgressEnabled: true,
      })
    ),
    http.get('/api/system/rum-config', () =>
      HttpResponse.json({ enabled: false })
    ),
    http.get('/api/notification', () =>
      HttpResponse.json({
        enabled: false,
        message: '',
        updatedOn: null,
      })
    ),
    http.get('/api/project/by-iam/:iamId', ({ params }) =>
      HttpResponse.json(params.iamId === data.user.iamId ? data.projects : [])
    ),
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/byNumber', ({ request }) => {
      const selected = selectedProjects(request);
      return HttpResponse.json(
        data.projects.filter((p) => selected.has(p.projectNumber))
      );
    }),
    http.get('/api/project/personnel', ({ request }) => {
      const selected = selectedProjects(request);
      const iamId = new URL(request.url).searchParams.get('iamId');
      return HttpResponse.json(
        iamId === data.user.iamId
          ? data.personnel.filter((p) => selected.has(p.projectId))
          : []
      );
    }),
    http.get('/api/project/transactions', ({ request }) => {
      const selected = selectedProjects(request);
      return HttpResponse.json(
        data.transactions.filter((p) => selected.has(p.projectNumber))
      );
    }),
    http.get('/api/project/projection/:projectNumber', ({ params }) => {
      const projection = data.projections[String(params.projectNumber)];
      return projection ? HttpResponse.json(projection) : unavailable();
    }),
    http.get('/api/search/catalog', () =>
      HttpResponse.json({ projects: catalog, reports: [] })
    ),
    http.get('/api/search/projects/team', () =>
      HttpResponse.json({
        myManagedProjects: [],
        myProjects: catalog,
        principalInvestigators: [],
        projects: catalog,
      })
    ),
    http.get('/api/search/projects/resolve-pi', ({ request }) => {
      const projectNumber =
        new URL(request.url).searchParams.get('projectNumber') ?? '';
      return projectNumbers.has(projectNumber)
        ? HttpResponse.json({ iamId: data.user.iamId, projectNumber })
        : unavailable();
    }),
    // Demo requests must never fall through to a real API, including mutations.
    http.all('/api/*', unavailable),
    http.all('/login', () =>
      HttpResponse.redirect(`/projects/${data.user.iamId}`)
    ),
    http.all('/logout', () =>
      HttpResponse.redirect(`/projects/${data.user.iamId}`)
    ),
  ];
}
