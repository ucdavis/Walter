export const tooltipDefinitions = {
  balance: 'Balance is your total budget minus expenses and commitments',
  commitment:
    'Commitment / Encumbrance are funds set aside when a requisition is fully approved; it is automatically released when the associated purchase order is created (or when an approved requisition is canceled before PO creation).',
  fte: 'Full-Time Equivalent (FTE) equals one employee working 100% time.',
} as const;

export type TooltipDefinitionKey = keyof typeof tooltipDefinitions;
