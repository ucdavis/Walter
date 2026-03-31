export const tooltipDefinitions = {
  awardCloseDate:
    'Final closeout date after which charges can no longer be posted to the award.',
  balance: 'Balance is your total budget minus expenses and commitments',
  billingCycle:
    'How often the system is set to generate sponsor billing.',
  burdenScheduleRate:
    'Indirect cost rate setup used to calculate burden on eligible expenses.',
  burdenStructure:
    'Rule set that determines which costs receive indirect cost charges and how they are calculated.',
  cbr: 'Monthly composite benefit rate cost, including fringe/benefit burden.',
  chartStringBreakdown:
    'Summary of how project costs are organized by financial coding segments.',
  commitment:
    'Commitment / Encumbrance are funds set aside when a requisition is fully approved; it is automatically released when the associated purchase order is created (or when an approved requisition is canceled before PO creation).',
  contractAdministrator:
    'Research admin contact for invoicing, contract, and sponsor-facing award matters.',
  costShareRequiredBySponsor:
    'Indicates whether the sponsor requires the university to contribute part of the project cost.',
  distributionPercent:
    "Distribution percent shows what share of the position's effort and pay is charged to this funding line.",
  expenditureCategory:
    'High-level grouping of costs, such as labor, travel, or supplier costs.',
  fte: 'Full-Time Equivalent (FTE) equals one employee working 100% time.',
  grantAdministrator:
    'Research admin contact for award setup and ongoing award administration.',
  monthlyCbr:
    'Monthly composite benefit rate cost, including fringe/benefit burden.',
  postReportingPeriod:
    'Number of days after the award end date allowed for reporting and closeout activity.',
} as const;

export type TooltipDefinitionKey = keyof typeof tooltipDefinitions;
