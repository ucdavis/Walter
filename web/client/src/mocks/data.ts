import type { ProjectRecord, ManagedPiRecord } from '@/queries/project.ts';
import type { PersonnelRecord } from '@/queries/personnel.ts';
import type { User } from '@/queries/user.ts';

export const fakeUser: User = {
  email: 'demo.pm@example.edu',
  employeeId: 'E0000001',
  id: 'demo-user-id',
  kerberos: 'demopm',
  name: 'Demo, Pat (PM)',
  roles: ['User', 'AccrualViewer'],
};

export const fakeManagedPis: ManagedPiRecord[] = [
  { employeeId: 'E1000001', name: 'Tanaka, Yuki', projectCount: 3 },
  { employeeId: 'E1000002', name: 'Morgan, Sam', projectCount: 2 },
];

const sponsoredAwardDefaults = {
  awardCloseDate: '2024-10-31',
  awardStatus: 'Active',
  billingCycle: 'Monthly',
  contractAdministrator: 'Nolan, Jordan',
  costShareRequiredBySponsor: 'N',
  grantAdministrator: 'Park, Marisol',
  postReportingPeriod: '60',
} as const;

const owningOrgCodes: Record<string, string> = {
  'Entomology & Nematology': 'AENMGEN',
  'Land, Air & Water Resources': 'ALAWR01',
  'Plant Sciences': 'APLS001',
};

function orgCode(org: string): string {
  return owningOrgCodes[org] ?? '';
}

// Ratios must sum to 1. Applied uniformly to budget/expense/commitment/balance.
const expenditureCategories: Array<{ name: string; ratio: number }> = [
  { name: '01 - Salaries and Wages', ratio: 0.4 },
  { name: '02 - Fringe Benefits', ratio: 0.15 },
  { name: '03 - Supplies / Services / Other Expenses', ratio: 0.1 },
  { name: '04 - Equipment and Facilities', ratio: 0.1 },
  { name: '07 - Travel', ratio: 0.05 },
  { name: '09 - Indirect Costs', ratio: 0.2 },
];

function makeProject(overrides: Partial<ProjectRecord>): ProjectRecord {
  return {
    activityCode: null,
    activityDesc: '',
    awardCloseDate: null,
    awardEndDate: null,
    awardName: null,
    awardNumber: null,
    awardPi: null,
    awardStartDate: null,
    awardStatus: null,
    awardType: null,
    balance: 0,
    billingCycle: null,
    budget: 0,
    commitments: 0,
    expenses: 0,
    ppmBudBal: 0,
    ppmBudget: 0,
    ppmCommitments: 0,
    ppmExpenses: 0,
    contractAdministrator: null,
    copi: null,
    costShareRequiredBySponsor: null,
    displayName: '',
    expenditureCategoryName: null,
    fundCode: null,
    fundDesc: '',
    grantAdministrator: null,
    pa: null,
    pi: null,
    pm: null,
    pmEmployeeId: null,
    postReportingPeriod: null,
    primarySponsorName: null,
    programCode: null,
    programDesc: '',
    projectBurdenCostRate: null,
    projectBurdenScheduleBase: null,
    projectFund: null,
    projectName: '',
    projectNumber: '',
    projectOwningOrg: '',
    projectOwningOrgCode: '',
    projectStatusCode: 'ACTIVE',
    projectType: 'Sponsored',
    purposeDesc: '',
    sponsorAwardNumber: null,
    taskName: '',
    taskNum: '1',
    taskStatus: 'Active',
    ...overrides,
  };
}

interface SponsoredConfig {
  awardCloseDate?: string;
  awardEndDate: string;
  awardName: string;
  awardNumber: string;
  awardPi: string;
  awardStartDate: string;
  awardType: string;
  billingCycle?: string;
  contractAdministrator?: string;
  displayName: string;
  grantAdministrator?: string;
  pi: string;
  primarySponsorName: string;
  projectBurdenCostRate: string;
  projectBurdenScheduleBase: string;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  sponsorAwardNumber: string;
  taskName: string;
  taskNum: string;
  totalBalance: number;
  totalBudget: number;
  totalCommitments: number;
  totalExpenses: number;
}

function makeSponsoredProject(cfg: SponsoredConfig): ProjectRecord[] {
  return expenditureCategories.map((cat) =>
    makeProject({
      ...sponsoredAwardDefaults,
      awardCloseDate: cfg.awardCloseDate ?? sponsoredAwardDefaults.awardCloseDate,
      awardEndDate: cfg.awardEndDate,
      awardName: cfg.awardName,
      awardNumber: cfg.awardNumber,
      awardPi: cfg.awardPi,
      awardStartDate: cfg.awardStartDate,
      awardType: cfg.awardType,
      balance: cfg.totalBalance * cat.ratio,
      billingCycle: cfg.billingCycle ?? sponsoredAwardDefaults.billingCycle,
      budget: cfg.totalBudget * cat.ratio,
      commitments: cfg.totalCommitments * cat.ratio,
      contractAdministrator:
        cfg.contractAdministrator ?? sponsoredAwardDefaults.contractAdministrator,
      displayName: cfg.displayName,
      expenditureCategoryName: cat.name,
      expenses: cfg.totalExpenses * cat.ratio,
      grantAdministrator:
        cfg.grantAdministrator ?? sponsoredAwardDefaults.grantAdministrator,
      pi: cfg.pi,
      pm: 'Demo, Pat (PM)',
      pmEmployeeId: 'E0000001',
      primarySponsorName: cfg.primarySponsorName,
      projectBurdenCostRate: cfg.projectBurdenCostRate,
      projectBurdenScheduleBase: cfg.projectBurdenScheduleBase,
      projectName: cfg.projectName,
      projectNumber: cfg.projectNumber,
      projectOwningOrg: cfg.projectOwningOrg,
      projectOwningOrgCode: orgCode(cfg.projectOwningOrg),
      projectType: 'Sponsored',
      sponsorAwardNumber: cfg.sponsorAwardNumber,
      taskName: cfg.taskName,
      taskNum: cfg.taskNum,
    })
  );
}

interface InternalTask {
  activityCode: string;
  balance: number;
  budget: number;
  commitments: number;
  expenditureCategoryName: string;
  expenses: number;
  fundCode: string;
  programCode: string;
  taskName: string;
  taskNum: string;
}

function makeInternalProject(config: {
  displayName: string;
  owningOrg: string;
  pi: string;
  projectNumber: string;
  tasks: InternalTask[];
}): ProjectRecord[] {
  return config.tasks.map((t) =>
    makeProject({
      activityCode: t.activityCode,
      balance: t.balance,
      budget: t.budget,
      commitments: t.commitments,
      displayName: config.displayName,
      expenditureCategoryName: t.expenditureCategoryName,
      expenses: t.expenses,
      fundCode: t.fundCode,
      pi: config.pi,
      pm: 'Demo, Pat (PM)',
      pmEmployeeId: 'E0000001',
      programCode: t.programCode,
      projectName: `${config.displayName} ${config.projectNumber}`,
      projectNumber: config.projectNumber,
      projectOwningOrg: config.owningOrg,
      projectOwningOrgCode: orgCode(config.owningOrg),
      projectType: 'Internal',
      taskName: t.taskName,
      taskNum: t.taskNum,
    })
  );
}

const alexProjects: ProjectRecord[] = [
  ...makeSponsoredProject({
    awardEndDate: '2026-12-31',
    awardName: 'Soil Microbiome Dynamics in Arid Systems',
    awardNumber: 'AWD-20240118',
    awardPi: 'Tanaka, Yuki',
    awardStartDate: '2024-01-01',
    awardType: '03-Federal Grants',
    displayName: 'Soil Microbiome Dynamics',
    pi: 'Tanaka, Yuki',
    primarySponsorName: 'National Science Foundation',
    projectBurdenCostRate: '0.265',
    projectBurdenScheduleBase: 'MTDC-Rev 001',
    projectName: 'Soil Microbiome K31RIV001',
    projectNumber: 'K31RIV001',
    projectOwningOrg: 'Land, Air & Water Resources',
    sponsorAwardNumber: 'NSF-2024-0118',
    taskName: 'NATIONAL SCIENCE FOUNDATION-2024-0118 SOIL MICROBIOME',
    taskNum: 'A47KR21',
    totalBalance: 142_500,
    totalBudget: 480_000,
    totalCommitments: 18_200,
    totalExpenses: 319_300,
  }),
  ...makeSponsoredProject({
    awardCloseDate: '2024-08-31',
    awardEndDate: '2026-06-30',
    awardName: 'Drought Response in Perennial Crops',
    awardNumber: 'AWD-20230644',
    awardPi: 'Tanaka, Yuki',
    awardStartDate: '2023-07-01',
    awardType: '03-Federal Grants',
    billingCycle: 'Quarterly',
    displayName: 'Drought Response',
    pi: 'Tanaka, Yuki',
    primarySponsorName: 'USDA NIFA',
    projectBurdenCostRate: '0.265',
    projectBurdenScheduleBase: 'MTDC-Rev 001',
    projectName: 'Drought Response K31RIV002',
    projectNumber: 'K31RIV002',
    projectOwningOrg: 'Plant Sciences',
    sponsorAwardNumber: 'USDA-2023-0644',
    taskName: 'USDA NIFA-2023-0644 DROUGHT RESPONSE PERENNIAL',
    taskNum: 'B92RV08',
    totalBalance: 28_900,
    totalBudget: 225_000,
    totalCommitments: 4_100,
    totalExpenses: 192_000,
  }),
  ...makeInternalProject({
    displayName: 'Tanaka Startup',
    owningOrg: 'Land, Air & Water Resources',
    pi: 'Tanaka, Yuki',
    projectNumber: 'FPAENM2341',
    tasks: [
      {
        activityCode: '000000',
        balance: 6_200,
        budget: 15_000,
        commitments: 0,
        expenditureCategoryName: '04 - Equipment and Facilities',
        expenses: 8_800,
        fundCode: '13U20',
        programCode: '000',
        taskName: 'LAB EQUIPMENT PURCHASES FY25',
        taskNum: 'EQP2341',
      },
      {
        activityCode: '000000',
        balance: 3_400,
        budget: 6_000,
        commitments: 0,
        expenditureCategoryName: '03 - Supplies / Services / Other Expenses',
        expenses: 2_600,
        fundCode: '13U20',
        programCode: '000',
        taskName: 'RESEARCH SUPPLIES AND CONSUMABLES',
        taskNum: 'SUP2341',
      },
      {
        activityCode: '000000',
        balance: 2_800,
        budget: 4_000,
        commitments: 0,
        expenditureCategoryName: '07 - Travel',
        expenses: 1_200,
        fundCode: '13U20',
        programCode: '000',
        taskName: 'CONFERENCE AND FIELD TRAVEL',
        taskNum: 'TRV2341',
      },
    ],
  }),
];

const samProjects: ProjectRecord[] = [
  ...makeSponsoredProject({
    awardCloseDate: '2025-04-30',
    awardEndDate: '2027-03-31',
    awardName: 'Pollinator Habitat Restoration',
    awardNumber: 'AWD-20240905',
    awardPi: 'Morgan, Sam',
    awardStartDate: '2024-04-01',
    awardType: '05-State Govt Contracts',
    billingCycle: 'Immediate',
    displayName: 'Pollinator Habitat',
    pi: 'Morgan, Sam',
    primarySponsorName: 'California Department of Water Resources',
    projectBurdenCostRate: '0',
    projectBurdenScheduleBase: 'No Indirect Cost',
    projectName: 'Pollinator Habitat K31MOR001',
    projectNumber: 'K31MOR001',
    projectOwningOrg: 'Entomology & Nematology',
    sponsorAwardNumber: 'CADWR-2024-0905',
    taskName: 'CALIFORNIA DEPARTMENT OF WATER-4600014181 POLLINATOR HABITAT',
    taskNum: '375D73X',
    totalBalance: 88_100,
    totalBudget: 150_000,
    totalCommitments: 9_400,
    totalExpenses: 52_500,
  }),
  ...makeInternalProject({
    displayName: 'Morgan Discretionary',
    owningOrg: 'Entomology & Nematology',
    pi: 'Morgan, Sam',
    projectNumber: 'FPAENM3102',
    tasks: [
      {
        activityCode: '000000',
        balance: 4_100,
        budget: 10_000,
        commitments: 0,
        expenditureCategoryName: '03 - Supplies / Services / Other Expenses',
        expenses: 5_900,
        fundCode: '13U20',
        programCode: '000',
        taskName: 'POLLINATOR LAB OPERATIONS FY25',
        taskNum: 'OPS3102',
      },
      {
        activityCode: '000000',
        balance: 2_400,
        budget: 5_000,
        commitments: 0,
        expenditureCategoryName: '03 - Supplies / Services / Other Expenses',
        expenses: 2_600,
        fundCode: '13U20',
        programCode: '000',
        taskName: 'FACULTY DISCRETIONARY FUND',
        taskNum: 'DSC3102',
      },
    ],
  }),
];

export const fakeProjectsByPi: Record<string, ProjectRecord[]> = {
  E1000001: alexProjects,
  E1000002: samProjects,
};

export const fakeProjectsByNumber: Record<string, ProjectRecord[]> = {};
for (const records of Object.values(fakeProjectsByPi)) {
  for (const r of records) {
    fakeProjectsByNumber[r.projectNumber] = [
      ...(fakeProjectsByNumber[r.projectNumber] ?? []),
      r,
    ];
  }
}

interface PersonSeed {
  compositeBenefitRate: number;
  distributionPercent: number;
  employeeId: string;
  fte: number;
  fundingEffectiveDate: string;
  fundingEndDate: string;
  jobCode: string;
  jobEffectiveDate: string;
  jobEndDate: string;
  monthlyRate: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
}

function makePerson(
  seed: PersonSeed,
  project: ProjectRecord
): PersonnelRecord {
  return {
    compositeBenefitRate: seed.compositeBenefitRate,
    distributionPercent: seed.distributionPercent,
    employeeId: seed.employeeId,
    fte: seed.fte,
    fundingEffectiveDate: seed.fundingEffectiveDate,
    fundingEndDate: seed.fundingEndDate,
    jobCode: seed.jobCode,
    jobEffectiveDate: seed.jobEffectiveDate,
    jobEndDate: seed.jobEndDate,
    monthlyRate: seed.monthlyRate,
    name: seed.name,
    positionDescription: seed.positionDescription,
    positionNumber: seed.positionNumber,
    projectDescription: project.projectName,
    projectId: project.projectNumber,
  };
}

const k31riv001People: PersonSeed[] = [
  {
    compositeBenefitRate: 0.34,
    distributionPercent: 100,
    employeeId: 'E2001001',
    fte: 1.0,
    fundingEffectiveDate: '2024-01-01',
    fundingEndDate: '2026-12-31',
    jobCode: '003390',
    jobEffectiveDate: '2024-01-01',
    jobEndDate: '2026-12-31',
    monthlyRate: 6_200,
    name: 'Okafor, Kemi',
    positionDescription: 'Postdoctoral Scholar - Employee',
    positionNumber: 'POS410221',
  },
  {
    compositeBenefitRate: 0.38,
    distributionPercent: 75,
    employeeId: 'E2001002',
    fte: 1.0,
    fundingEffectiveDate: '2024-01-01',
    fundingEndDate: '2026-12-31',
    jobCode: '007101',
    jobEffectiveDate: '2023-07-01',
    jobEndDate: '2028-06-30',
    monthlyRate: 7_450,
    name: 'Delgado, Miguel',
    positionDescription: 'Research Associate',
    positionNumber: 'POS410334',
  },
  {
    compositeBenefitRate: 0.19,
    distributionPercent: 50,
    employeeId: 'E2001003',
    fte: 0.5,
    fundingEffectiveDate: '2024-09-01',
    fundingEndDate: '2026-06-15',
    jobCode: '003266',
    jobEffectiveDate: '2024-09-01',
    jobEndDate: '2026-06-15',
    monthlyRate: 3_980,
    name: 'Patel, Anjali',
    positionDescription: 'Graduate Student Researcher',
    positionNumber: 'POS410401',
  },
  {
    compositeBenefitRate: 0.42,
    distributionPercent: 25,
    employeeId: 'E2001004',
    fte: 1.0,
    fundingEffectiveDate: '2024-01-01',
    fundingEndDate: '2026-12-31',
    jobCode: '007230',
    jobEffectiveDate: '2022-03-15',
    jobEndDate: '',
    monthlyRate: 4_860,
    name: 'Hardy, Chen-Wei',
    positionDescription: 'Laboratory Assistant II',
    positionNumber: 'POS410512',
  },
];

const k31riv002People: PersonSeed[] = [
  {
    compositeBenefitRate: 0.38,
    distributionPercent: 25,
    employeeId: 'E2001002',
    fte: 1.0,
    fundingEffectiveDate: '2023-07-01',
    fundingEndDate: '2026-06-30',
    jobCode: '007101',
    jobEffectiveDate: '2023-07-01',
    jobEndDate: '2028-06-30',
    monthlyRate: 7_450,
    name: 'Delgado, Miguel',
    positionDescription: 'Research Associate',
    positionNumber: 'POS410334',
  },
  {
    compositeBenefitRate: 0.19,
    distributionPercent: 50,
    employeeId: 'E2001005',
    fte: 0.5,
    fundingEffectiveDate: '2024-01-01',
    fundingEndDate: '2026-03-31',
    jobCode: '003266',
    jobEffectiveDate: '2023-09-15',
    jobEndDate: '2026-06-15',
    monthlyRate: 3_980,
    name: 'Iwasaki, Ren',
    positionDescription: 'Graduate Student Researcher',
    positionNumber: 'POS410608',
  },
];

const k31mor001People: PersonSeed[] = [
  {
    compositeBenefitRate: 0.34,
    distributionPercent: 100,
    employeeId: 'E2001010',
    fte: 1.0,
    fundingEffectiveDate: '2024-04-01',
    fundingEndDate: '2027-03-31',
    jobCode: '003390',
    jobEffectiveDate: '2024-04-01',
    jobEndDate: '2027-03-31',
    monthlyRate: 5_980,
    name: 'Mbeki, Thandi',
    positionDescription: 'Postdoctoral Scholar - Employee',
    positionNumber: 'POS420101',
  },
  {
    compositeBenefitRate: 0.19,
    distributionPercent: 75,
    employeeId: 'E2001011',
    fte: 0.5,
    fundingEffectiveDate: '2024-09-01',
    fundingEndDate: '2027-03-31',
    jobCode: '003266',
    jobEffectiveDate: '2024-09-01',
    jobEndDate: '2026-09-01',
    monthlyRate: 3_980,
    name: 'Bauer, Lennart',
    positionDescription: 'Graduate Student Researcher',
    positionNumber: 'POS420150',
  },
  {
    compositeBenefitRate: 0.42,
    distributionPercent: 20,
    employeeId: 'E2001012',
    fte: 1.0,
    fundingEffectiveDate: '2024-04-01',
    fundingEndDate: '2027-03-31',
    jobCode: '007230',
    jobEffectiveDate: '2021-08-01',
    jobEndDate: '',
    monthlyRate: 4_720,
    name: 'Coleman, Priya',
    positionDescription: 'Laboratory Assistant II',
    positionNumber: 'POS420188',
  },
];

const fpaenm2341People: PersonSeed[] = [
  {
    compositeBenefitRate: 0.42,
    distributionPercent: 15,
    employeeId: 'E2001004',
    fte: 1.0,
    fundingEffectiveDate: '2024-07-01',
    fundingEndDate: '2026-06-30',
    jobCode: '007230',
    jobEffectiveDate: '2022-03-15',
    jobEndDate: '',
    monthlyRate: 4_860,
    name: 'Hardy, Chen-Wei',
    positionDescription: 'Laboratory Assistant II',
    positionNumber: 'POS410512',
  },
];

const fpaenm3102People: PersonSeed[] = [
  {
    compositeBenefitRate: 0.42,
    distributionPercent: 10,
    employeeId: 'E2001012',
    fte: 1.0,
    fundingEffectiveDate: '2024-07-01',
    fundingEndDate: '2026-06-30',
    jobCode: '007230',
    jobEffectiveDate: '2021-08-01',
    jobEndDate: '',
    monthlyRate: 4_720,
    name: 'Coleman, Priya',
    positionDescription: 'Laboratory Assistant II',
    positionNumber: 'POS420188',
  },
];

const personnelSeedsByProject: Record<string, PersonSeed[]> = {
  FPAENM2341: fpaenm2341People,
  FPAENM3102: fpaenm3102People,
  K31MOR001: k31mor001People,
  K31RIV001: k31riv001People,
  K31RIV002: k31riv002People,
};

export function fakePersonnelForProject(
  projectCode: string
): PersonnelRecord[] {
  const seeds = personnelSeedsByProject[projectCode];
  const records = fakeProjectsByNumber[projectCode];
  if (!seeds || !records || records.length === 0) return [];
  const first = records[0];
  return seeds.map((s) => makePerson(s, first));
}
