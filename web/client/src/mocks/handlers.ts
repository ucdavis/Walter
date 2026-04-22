import { http, HttpResponse } from 'msw';
import type {
  GLPPMReconciliationRecord,
  GLTransactionRecord,
  ProjectRecord,
} from '@/queries/project.ts';
import type { SearchCatalog } from '@/queries/search.ts';
import {
  fakeAccrualDepartmentDetail,
  fakeAccrualOverview,
} from './accrualData.ts';
import {
  fakeManagedPis,
  fakePersonnelForProject,
  fakeProjectsByNumber,
  fakeProjectsByPi,
  fakeUser,
} from './data.ts';

const emptyCatalog: SearchCatalog = { projects: [], reports: [] };

function reconciliationRecordFor(
  project: ProjectRecord
): GLPPMReconciliationRecord {
  return {
    activityCode: project.activityCode,
    activityDescription: project.activityDesc || null,
    dataSource: 'mock',
    financialDepartment: project.projectOwningOrgCode || null,
    fundCode: project.fundCode,
    fundDescription: project.fundDesc || null,
    glActualAmount: project.expenses,
    ppmBudBal: -project.balance,
    ppmBudget: project.budget,
    ppmFundCode: project.fundCode ?? '',
    ppmFundDescription: project.fundDesc || null,
    ppmItdExp: project.expenses,
    programCode: project.programCode,
    programDescription: project.programDesc || null,
    project: project.projectNumber,
    projectDescription: project.projectName,
    remainingBalance: project.balance,
  };
}

interface TransactionSeed {
  amount: number;
  description: string;
  date: string;
  documentType: string;
  reference: string;
}

function makeTransaction(
  project: ProjectRecord,
  seed: TransactionSeed
): GLTransactionRecord {
  return {
    account: '770000',
    accountDescription: 'Operating Expense',
    accountingSequenceNumber: seed.reference,
    activity: project.activityCode,
    activityDescription: project.activityDesc || null,
    actualAmount: seed.amount,
    actualFlag: 'A',
    batchStatus: 'Posted',
    commitmentAmount: 0,
    documentType: seed.documentType,
    encumbranceTypeCode: null,
    entity: '3110',
    entityDescription: 'UC Davis',
    financialDepartment: project.projectOwningOrgCode || null,
    financialDepartmentDescription: project.projectOwningOrg || null,
    fund: project.fundCode,
    fundDescription: project.fundDesc || null,
    journalAcctDate: seed.date,
    journalBatchName: 'Monthly Close',
    journalCategory: 'GL Journal',
    journalLineDescription: seed.description,
    journalName: 'GL-Monthly-Close',
    journalReference: seed.reference,
    journalSource: 'AP',
    naturalAccountType: 'Expense',
    obligationAmount: 0,
    periodName: seed.date.slice(0, 7),
    program: project.programCode,
    programDescription: project.programDesc || null,
    project: project.projectNumber,
    projectDescription: project.projectName,
    purpose: '68',
    purposeDescription: 'Research',
    reference: seed.reference,
    trackingNo: seed.reference,
  };
}

const fpaenm2341Transactions: TransactionSeed[] = [
  {
    amount: 3_250.0,
    date: '2025-09-12',
    description: 'Keysight oscilloscope — capital equipment',
    documentType: 'AP Invoice',
    reference: 'INV-884231',
  },
  {
    amount: 1_842.55,
    date: '2025-10-03',
    description: 'Fisher Scientific — pipettes, gloves, reagents',
    documentType: 'AP Invoice',
    reference: 'INV-891077',
  },
  {
    amount: 612.4,
    date: '2025-10-18',
    description: 'Conference registration (ASA annual meeting)',
    documentType: 'AP Invoice',
    reference: 'INV-893014',
  },
  {
    amount: 2_198.0,
    date: '2025-11-04',
    description: 'Sigma-Aldrich — consumables',
    documentType: 'AP Invoice',
    reference: 'INV-897552',
  },
  {
    amount: 420.75,
    date: '2025-11-22',
    description: 'Field site mileage reimbursement',
    documentType: 'AP Invoice',
    reference: 'EXP-004221',
  },
  {
    amount: 4_476.3,
    date: '2025-12-08',
    description: 'Greenhouse supplies — quarterly order',
    documentType: 'AP Invoice',
    reference: 'INV-903181',
  },
];

const fpaenm3102Transactions: TransactionSeed[] = [
  {
    amount: 2_110.0,
    date: '2025-09-19',
    description: 'BioQuip — collection equipment',
    documentType: 'AP Invoice',
    reference: 'INV-885402',
  },
  {
    amount: 1_340.5,
    date: '2025-10-14',
    description: 'Native seed stock — quarterly',
    documentType: 'AP Invoice',
    reference: 'INV-892108',
  },
  {
    amount: 980.25,
    date: '2025-11-07',
    description: 'Protective gear and field kits',
    documentType: 'AP Invoice',
    reference: 'INV-897881',
  },
  {
    amount: 725.0,
    date: '2025-12-02',
    description: 'Vendor catering — lab meeting',
    documentType: 'AP Invoice',
    reference: 'INV-901445',
  },
];

function buildTransactions(projectCode: string): GLTransactionRecord[] {
  const records = fakeProjectsByNumber[projectCode];
  if (!records || records.length === 0) return [];
  const first = records[0];
  const seeds =
    projectCode === 'FPAENM2341'
      ? fpaenm2341Transactions
      : projectCode === 'FPAENM3102'
        ? fpaenm3102Transactions
        : [];
  return seeds.map((s) => makeTransaction(first, s));
}

// Trigger a discrepancy warning on FPAENM2341 by nudging the GL side so
// glActualAmount + ppmBudBal !== 0 for the first task of that project.
function buildReconciliationRecords(): GLPPMReconciliationRecord[] {
  const records: GLPPMReconciliationRecord[] = [];
  for (const list of Object.values(fakeProjectsByPi)) {
    for (const p of list) {
      if (p.projectType !== 'Internal') continue;
      const rec = reconciliationRecordFor(p);
      if (p.projectNumber === 'FPAENM2341' && p.taskNum === 'EQP2341') {
        rec.glActualAmount += 1_250;
      }
      records.push(rec);
    }
  }
  return records;
}

export const handlers = [
  http.get('/api/user/me', () => HttpResponse.json(fakeUser)),

  // Specific paths must come before `/api/project/:employeeId` or that
  // wildcard will swallow them.
  http.get('/api/project/managed/:employeeId', ({ params }) => {
    if (params.employeeId === fakeUser.employeeId) {
      return HttpResponse.json(fakeManagedPis);
    }
    return HttpResponse.json([]);
  }),

  http.get('/api/project/byNumber', ({ request }) => {
    const url = new URL(request.url);
    const codes = (url.searchParams.get('projectCodes') ?? '')
      .split(',')
      .filter(Boolean);
    const records = codes.flatMap((c) => fakeProjectsByNumber[c] ?? []);
    return HttpResponse.json(records);
  }),

  http.get('/api/project/gl-ppm-reconciliation', ({ request }) => {
    const url = new URL(request.url);
    const codes = (url.searchParams.get('projectCodes') ?? '')
      .split(',')
      .filter(Boolean);
    const codeSet = new Set(codes);
    const records = buildReconciliationRecords().filter((r) =>
      codeSet.has(r.project)
    );
    return HttpResponse.json(records);
  }),

  http.get('/api/project/transactions', ({ request }) => {
    const url = new URL(request.url);
    const codes = (url.searchParams.get('projectCodes') ?? '')
      .split(',')
      .filter(Boolean);
    const records = codes.flatMap((c) => buildTransactions(c));
    return HttpResponse.json(records);
  }),

  http.get('/api/project/personnel', ({ request }) => {
    const url = new URL(request.url);
    const codes = (url.searchParams.get('projectCodes') ?? '')
      .split(',')
      .filter(Boolean);
    const records = codes.flatMap((c) => fakePersonnelForProject(c));
    return HttpResponse.json(records);
  }),

  http.get('/api/project/:employeeId', ({ params }) => {
    const records = fakeProjectsByPi[params.employeeId as string] ?? [];
    return HttpResponse.json(records);
  }),

  http.get('/api/search/catalog', () => HttpResponse.json(emptyCatalog)),

  http.get('/api/accrual/overview', () =>
    HttpResponse.json(fakeAccrualOverview())
  ),

  http.get('/api/accrual/department/:code', ({ params }) =>
    HttpResponse.json(fakeAccrualDepartmentDetail(params.code as string))
  ),
];
