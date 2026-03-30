export const tooltipDefinitions = {
  balance: 'Balance is your total budget minus expenses and commitments',
  fte: 'Full-Time Equivalent (FTE) equals one employee working 100% time.',
} as const;

export type TooltipDefinitionKey = keyof typeof tooltipDefinitions;
