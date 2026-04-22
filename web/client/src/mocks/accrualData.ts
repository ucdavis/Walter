import type {
  AccrualDepartmentBreakdownRow,
  AccrualDepartmentDetailResponse,
  AccrualDepartmentEmployeeRow,
  AccrualDepartmentOption,
  AccrualLostCostTrendPoint,
  AccrualOverviewResponse,
  AccrualStatusTrendPoint,
} from '@/queries/accrual.ts';

const asOfDate = '2026-04-01';
const ytdMonthCount = 4;

interface EmployeeSeed {
  accrualHoursPerMonth: number;
  balanceHours: number;
  capHours: number;
  classification: string;
  departmentCode: string;
  employeeId: string;
  employeeName: string;
  hourlyRate: number;
  lastVacationDate: string | null;
}

const departments: AccrualDepartmentOption[] = [
  { code: 'AENMGEN', name: 'Entomology & Nematology' },
  { code: 'ALAWR01', name: 'Land, Air & Water Resources' },
  { code: 'APLS001', name: 'Plant Sciences' },
];

const employees: EmployeeSeed[] = [
  // Entomology & Nematology
  {
    accrualHoursPerMonth: 10,
    balanceHours: 248,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000101',
    employeeName: 'Coleman, Priya',
    hourlyRate: 48.5,
    lastVacationDate: '2024-12-20',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 232,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000102',
    employeeName: 'Navarro, Estrella',
    hourlyRate: 62.3,
    lastVacationDate: '2025-08-14',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 196,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000103',
    employeeName: 'Okoro, Adaeze',
    hourlyRate: 41.8,
    lastVacationDate: '2025-11-02',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 128,
    capHours: 240,
    classification: 'Career Staff - Non-Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000104',
    employeeName: 'Bauer, Lennart',
    hourlyRate: 31.25,
    lastVacationDate: '2026-02-18',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 88,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000105',
    employeeName: 'Mbeki, Thandi',
    hourlyRate: 57.1,
    lastVacationDate: '2026-03-20',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 64,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000106',
    employeeName: 'Dalgaard, Mikael',
    hourlyRate: 44.6,
    lastVacationDate: '2026-02-05',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 40,
    capHours: 240,
    classification: 'Career Staff - Non-Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000107',
    employeeName: 'Castillo-Reyes, Joana',
    hourlyRate: 29.4,
    lastVacationDate: '2026-03-14',
  },
  {
    accrualHoursPerMonth: 14,
    balanceHours: 280,
    capHours: 280,
    classification: 'Academic - Non-Represented',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000108',
    employeeName: 'Visser, Johan',
    hourlyRate: 71.8,
    lastVacationDate: '2024-09-05',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 112,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'AENMGEN',
    employeeId: 'E3000109',
    employeeName: 'Hendricks, Marcus',
    hourlyRate: 39.2,
    lastVacationDate: '2026-01-22',
  },

  // Land, Air & Water Resources
  {
    accrualHoursPerMonth: 10,
    balanceHours: 258,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000201',
    employeeName: 'Hardy, Chen-Wei',
    hourlyRate: 46.2,
    lastVacationDate: '2024-10-30',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 220,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000202',
    employeeName: 'Okafor, Kemi',
    hourlyRate: 55.8,
    lastVacationDate: '2025-07-12',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 188,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000203',
    employeeName: 'Delgado, Miguel',
    hourlyRate: 51.9,
    lastVacationDate: '2025-10-04',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 144,
    capHours: 240,
    classification: 'Career Staff - Non-Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000204',
    employeeName: 'Patel, Anjali',
    hourlyRate: 33.1,
    lastVacationDate: '2026-01-09',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 96,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000205',
    employeeName: 'Iwasaki, Ren',
    hourlyRate: 42.3,
    lastVacationDate: '2026-02-27',
  },
  {
    accrualHoursPerMonth: 14,
    balanceHours: 52,
    capHours: 280,
    classification: 'Academic - Non-Represented',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000206',
    employeeName: 'Quintero-Vega, Rafael',
    hourlyRate: 68.5,
    lastVacationDate: '2026-03-28',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 24,
    capHours: 240,
    classification: 'Career Staff - Non-Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000207',
    employeeName: 'Nielsen, Britt',
    hourlyRate: 28.6,
    lastVacationDate: '2026-04-04',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 240,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000208',
    employeeName: 'Wallace, Aditya',
    hourlyRate: 49.7,
    lastVacationDate: '2024-11-22',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 168,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'ALAWR01',
    employeeId: 'E3000209',
    employeeName: 'Fernández, Mireia',
    hourlyRate: 58.4,
    lastVacationDate: '2025-12-11',
  },

  // Plant Sciences
  {
    accrualHoursPerMonth: 10,
    balanceHours: 204,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'APLS001',
    employeeId: 'E3000301',
    employeeName: 'Tran, Minh-Anh',
    hourlyRate: 45.2,
    lastVacationDate: '2025-09-18',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 200,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'APLS001',
    employeeId: 'E3000302',
    employeeName: 'Borjan, Nikola',
    hourlyRate: 60.1,
    lastVacationDate: '2025-11-07',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 132,
    capHours: 240,
    classification: 'Career Staff - Non-Exempt',
    departmentCode: 'APLS001',
    employeeId: 'E3000303',
    employeeName: 'Al-Hassan, Samira',
    hourlyRate: 32.8,
    lastVacationDate: '2026-01-31',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 72,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'APLS001',
    employeeId: 'E3000304',
    employeeName: 'Beauchamp, Eloise',
    hourlyRate: 43.9,
    lastVacationDate: '2026-03-11',
  },
  {
    accrualHoursPerMonth: 12,
    balanceHours: 252,
    capHours: 240,
    classification: 'Managerial & Professional',
    departmentCode: 'APLS001',
    employeeId: 'E3000305',
    employeeName: 'Acharya, Rohit',
    hourlyRate: 59.6,
    lastVacationDate: '2024-08-09',
  },
  {
    accrualHoursPerMonth: 10,
    balanceHours: 108,
    capHours: 240,
    classification: 'Career Staff - Exempt',
    departmentCode: 'APLS001',
    employeeId: 'E3000306',
    employeeName: 'Monson, Gretchen',
    hourlyRate: 40.7,
    lastVacationDate: '2026-02-14',
  },
  {
    accrualHoursPerMonth: 14,
    balanceHours: 168,
    capHours: 280,
    classification: 'Academic - Non-Represented',
    departmentCode: 'APLS001',
    employeeId: 'E3000307',
    employeeName: 'Park, Marisol',
    hourlyRate: 66.4,
    lastVacationDate: '2025-12-03',
  },
];

const approachingThreshold = 0.75;

function toEmployeeRow(seed: EmployeeSeed): AccrualDepartmentEmployeeRow {
  const pctOfCap = seed.balanceHours / seed.capHours;
  const atCap = seed.balanceHours >= seed.capHours;
  const lostCostMonth = atCap ? seed.accrualHoursPerMonth * seed.hourlyRate : 0;
  const monthsToCap = atCap
    ? 0
    : (seed.capHours - seed.balanceHours) / seed.accrualHoursPerMonth;
  return {
    accrualHoursPerMonth: seed.accrualHoursPerMonth,
    balanceHours: seed.balanceHours,
    capHours: seed.capHours,
    classification: seed.classification,
    employeeId: seed.employeeId,
    employeeName: seed.employeeName,
    lastVacationDate: seed.lastVacationDate,
    lostCostMonth,
    monthsToCap,
    pctOfCap,
  };
}

function buildDepartmentDetail(
  departmentCode: string
): AccrualDepartmentDetailResponse {
  const dept = departments.find((d) => d.code === departmentCode);
  const departmentName = dept?.name ?? departmentCode;
  const deptEmployees = employees
    .filter((e) => e.departmentCode === departmentCode)
    .map(toEmployeeRow);

  const atCapCount = deptEmployees.filter((e) => e.pctOfCap >= 1).length;
  const approachingCapCount = deptEmployees.filter(
    (e) => e.pctOfCap >= approachingThreshold && e.pctOfCap < 1
  ).length;
  const headcount = deptEmployees.length;
  const avgBalanceHours =
    headcount === 0
      ? 0
      : deptEmployees.reduce((s, e) => s + e.balanceHours, 0) / headcount;
  const lostCostMonth = deptEmployees.reduce(
    (s, e) => s + e.lostCostMonth,
    0
  );
  const lostCostYtd = lostCostMonth * ytdMonthCount;

  return {
    approachingCapCount,
    asOfDate,
    atCapCount,
    avgBalanceHours,
    departmentCode,
    departmentName,
    departments,
    employees: deptEmployees,
    headcount,
    lostCostMonth,
    lostCostYtd,
    ytdMonthCount,
  };
}

function buildOverview(): AccrualOverviewResponse {
  const perDept: AccrualDepartmentBreakdownRow[] = departments.map((d) => {
    const detail = buildDepartmentDetail(d.code);
    return {
      approachingCapCount: detail.approachingCapCount,
      atCapCount: detail.atCapCount,
      avgBalanceHours: detail.avgBalanceHours,
      department: d.name,
      departmentCode: d.code,
      headcount: detail.headcount,
      lostCostMonth: detail.lostCostMonth,
      lostCostYtd: detail.lostCostYtd,
    };
  });

  const totalEmployees = perDept.reduce((s, d) => s + d.headcount, 0);
  const atCapCount = perDept.reduce((s, d) => s + d.atCapCount, 0);
  const approachingCapCount = perDept.reduce(
    (s, d) => s + d.approachingCapCount,
    0
  );
  const lostCostMonth = perDept.reduce((s, d) => s + d.lostCostMonth, 0);
  const lostCostYtd = lostCostMonth * ytdMonthCount;

  // 12-month trend, oldest first, ending at the current as-of month.
  const monthlyLostCost: AccrualLostCostTrendPoint[] = [
    { asOfDate: '2025-05-01', label: 'May 2025', lostCost: 2_140 },
    { asOfDate: '2025-06-01', label: 'Jun 2025', lostCost: 2_310 },
    { asOfDate: '2025-07-01', label: 'Jul 2025', lostCost: 2_565 },
    { asOfDate: '2025-08-01', label: 'Aug 2025', lostCost: 2_720 },
    { asOfDate: '2025-09-01', label: 'Sep 2025', lostCost: 2_905 },
    { asOfDate: '2025-10-01', label: 'Oct 2025', lostCost: 3_180 },
    { asOfDate: '2025-11-01', label: 'Nov 2025', lostCost: 3_340 },
    { asOfDate: '2025-12-01', label: 'Dec 2025', lostCost: 3_510 },
    { asOfDate: '2026-01-01', label: 'Jan 2026', lostCost: 3_645 },
    { asOfDate: '2026-02-01', label: 'Feb 2026', lostCost: 3_820 },
    { asOfDate: '2026-03-01', label: 'Mar 2026', lostCost: 4_045 },
    { asOfDate: '2026-04-01', label: 'Apr 2026', lostCost: lostCostMonth },
  ];

  const employeeStatusOverTime: AccrualStatusTrendPoint[] = [
    {
      active: 22,
      approaching: 2,
      asOfDate: '2025-05-01',
      atCap: 1,
      label: 'May 2025',
    },
    {
      active: 22,
      approaching: 2,
      asOfDate: '2025-06-01',
      atCap: 1,
      label: 'Jun 2025',
    },
    {
      active: 21,
      approaching: 3,
      asOfDate: '2025-07-01',
      atCap: 1,
      label: 'Jul 2025',
    },
    {
      active: 21,
      approaching: 2,
      asOfDate: '2025-08-01',
      atCap: 2,
      label: 'Aug 2025',
    },
    {
      active: 20,
      approaching: 3,
      asOfDate: '2025-09-01',
      atCap: 2,
      label: 'Sep 2025',
    },
    {
      active: 20,
      approaching: 3,
      asOfDate: '2025-10-01',
      atCap: 2,
      label: 'Oct 2025',
    },
    {
      active: 19,
      approaching: 4,
      asOfDate: '2025-11-01',
      atCap: 2,
      label: 'Nov 2025',
    },
    {
      active: 19,
      approaching: 3,
      asOfDate: '2025-12-01',
      atCap: 3,
      label: 'Dec 2025',
    },
    {
      active: 18,
      approaching: 4,
      asOfDate: '2026-01-01',
      atCap: 3,
      label: 'Jan 2026',
    },
    {
      active: 18,
      approaching: 4,
      asOfDate: '2026-02-01',
      atCap: 3,
      label: 'Feb 2026',
    },
    {
      active: 17,
      approaching: 5,
      asOfDate: '2026-03-01',
      atCap: 3,
      label: 'Mar 2026',
    },
    {
      active: totalEmployees - atCapCount - approachingCapCount,
      approaching: approachingCapCount,
      asOfDate: '2026-04-01',
      atCap: atCapCount,
      label: 'Apr 2026',
    },
  ];

  const possibleAccrualsThisMonth = employees.reduce(
    (s, e) => s + e.accrualHoursPerMonth * e.hourlyRate,
    0
  );
  const wasteRate =
    possibleAccrualsThisMonth === 0
      ? 0
      : lostCostMonth / possibleAccrualsThisMonth;

  return {
    approachingCapCount,
    asOfDate,
    atCapCount,
    departmentBreakdown: perDept,
    employeeStatusOverTime,
    lostCostMonth,
    lostCostYtd,
    monthlyLostCost,
    totalDepartments: departments.length,
    totalEmployees,
    wasteRate,
    ytdMonthCount,
  };
}

export function fakeAccrualOverview(): AccrualOverviewResponse {
  return buildOverview();
}

export function fakeAccrualDepartmentDetail(
  code: string
): AccrualDepartmentDetailResponse {
  return buildDepartmentDetail(code);
}
