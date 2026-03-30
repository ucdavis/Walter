export const tooltipDefinitions = {
  balance: 'Balance is your total budget minus expenses and commitments',
} as const;

export type TooltipDefinitionKey = keyof typeof tooltipDefinitions;
