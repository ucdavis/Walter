import { z } from 'zod';
import {
  applyAllocationRun,
  deriveTimelineMonths,
  isFundingSourceActiveInMonth,
  monthToIndex,
  monthsBetweenInclusive,
  projectPlan,
} from './projection.ts';

const id = z.string().min(1).max(100);
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const date = z.iso.date();
const percent = z.number().min(0).max(100);
const money = z.number().min(0).max(1_000_000_000);
const balance = z.number().min(-1_000_000_000).max(1_000_000_000);
const split = z.object({ fundingSourceId: id, percent });

export const planSchema = z.object({
  allocations: z
    .array(
      z.object({
        fundingSourceId: id,
        month,
        percent,
        personId: id,
      })
    )
    .max(6000),
  fundingSources: z
    .array(
      z.object({
        color: z.string().max(50),
        description: z.string().max(500).optional(),
        endDate: date,
        id,
        indirectRate: percent,
        name: z.string().min(1).max(200),
        startDate: date,
        startingBalance: balance,
      })
    )
    .max(30),
  people: z
    .array(
      z.object({
        annualSalary: money,
        fringeRate: percent,
        id,
        name: z.string().min(1).max(200),
      })
    )
    .max(100),
});

export const scenarioSchema = z.object({
  assumptions: z.array(z.string().max(500)).max(8),
  operations: z
    .array(
      z.union([
        z.object({
          annualSalary: money,
          endMonth: month,
          fringeRate: percent,
          fundingSourceId: id,
          name: z.string().min(1).max(200),
          percent,
          personId: id,
          startMonth: month,
          type: z.literal('hire'),
        }),
        z.object({
          endMonth: month,
          personId: id,
          splits: z.array(split).max(30),
          startMonth: month,
          type: z.literal('allocate'),
        }),
        z.object({
          annualSalary: money,
          fringeRate: percent,
          personId: id,
          type: z.literal('person'),
        }),
        z.object({
          endDate: date,
          fundingSourceId: id,
          indirectRate: percent,
          startDate: date,
          startingBalance: balance,
          type: z.literal('funding'),
        }),
      ])
    )
    .min(1)
    .max(12),
  title: z.string().min(1).max(160),
});

export type ProjectionPlan = z.infer<typeof planSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioOperation = Scenario['operations'][number];
export type CopilotMessage = { content: string; role: 'user' | 'assistant' };
export type CopilotReply = { message: string; scenario: Scenario | null };

export const copilotRequestSchema = z.object({
  asOf: month,
  messages: z
    .array(
      z.object({
        content: z.string().min(1).max(12_000),
        role: z.enum(['user', 'assistant']),
      })
    )
    .min(1)
    .max(16),
  plan: planSchema,
  scenario: scenarioSchema.nullable(),
});

export const planKey = (plan: ProjectionPlan) => JSON.stringify(plan);

export function validatePlan(plan: ProjectionPlan) {
  planSchema.parse(plan);
  for (const rows of [plan.people, plan.fundingSources]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new Error('People and funding sources must have unique IDs.');
    }
  }
  for (const source of plan.fundingSources) {
    if (source.startDate > source.endDate) {
      throw new Error(`${source.name}: start must be before end.`);
    }
  }
  const months = deriveTimelineMonths(plan.fundingSources, plan.allocations);
  if (months.length > 120) {
    throw new Error('Keep the demo within a ten-year planning window.');
  }
  const result = projectPlan({ ...plan, months });
  if (
    result.invalidAllocations.length ||
    result.allocationValidations.some((row) => row.overAllocated)
  ) {
    throw new Error(
      'Resolve allocations outside funding dates or above 100% before trying this scenario.'
    );
  }
  return result;
}

function checkRange(start: string, end: string, asOf?: string) {
  if (start > end || monthToIndex(end) - monthToIndex(start) > 119) {
    throw new Error('Choose an end month after the start, within ten years.');
  }
  if (asOf && start < asOf) {
    throw new Error(
      'Scenario allocations must start at or after the demo snapshot.'
    );
  }
}

// A proposal is evaluated on a copy. Only the planner's Apply action replaces
// the working plan; evaluating a tool call must never mutate it.
export function previewScenario(
  plan: ProjectionPlan,
  input: Scenario,
  asOf?: string
): ProjectionPlan {
  const scenario = scenarioSchema.parse(input);
  const draft = structuredClone(plan);
  for (const operation of scenario.operations) {
    if (operation.type === 'funding') {
      const source = draft.fundingSources.find(
        (row) => row.id === operation.fundingSourceId
      );
      if (!source) {
        throw new Error('That funding source is no longer in the plan.');
      }
      Object.assign(source, {
        endDate: operation.endDate,
        indirectRate: operation.indirectRate,
        startDate: operation.startDate,
        startingBalance: operation.startingBalance,
      });
    } else if (operation.type === 'person') {
      const person = draft.people.find((row) => row.id === operation.personId);
      if (!person) {
        throw new Error('That person is no longer in the plan.');
      }
      Object.assign(person, {
        annualSalary: operation.annualSalary,
        fringeRate: operation.fringeRate,
      });
    } else {
      checkRange(operation.startMonth, operation.endMonth, asOf);
      if (operation.type === 'hire') {
        if (draft.people.some((row) => row.id === operation.personId)) {
          throw new Error('A new hire must have a new person ID.');
        }
        draft.people.push({
          annualSalary: operation.annualSalary,
          fringeRate: operation.fringeRate,
          id: operation.personId,
          name: operation.name,
        });
      }
      if (!draft.people.some((row) => row.id === operation.personId)) {
        throw new Error('That person is no longer in the plan.');
      }
      const splits =
        operation.type === 'hire'
          ? [
              {
                fundingSourceId: operation.fundingSourceId,
                percent: operation.percent,
              },
            ]
          : operation.splits;
      if (
        new Set(splits.map((row) => row.fundingSourceId)).size !== splits.length
      ) {
        throw new Error('Use each funding source once in an allocation split.');
      }
      for (const funding of splits) {
        const source = draft.fundingSources.find(
          (row) => row.id === funding.fundingSourceId
        );
        if (
          !source ||
          !monthsBetweenInclusive(
            operation.startMonth,
            operation.endMonth
          ).every((value) => isFundingSourceActiveInMonth(source, value))
        ) {
          throw new Error(
            'Every allocation must fall within its funding dates.'
          );
        }
      }
      draft.allocations = applyAllocationRun(draft.allocations, {
        ...operation,
        splits,
      });
    }
  }
  validatePlan(draft);
  return draft;
}

export function projectionFacts(plan: ProjectionPlan) {
  const result = projectPlan(plan);
  return plan.fundingSources.map((source) => {
    const summary = result.fundingSummaries.find(
      (row) => row.sourceId === source.id
    )!;
    const monthly = result.fundingMonths.filter(
      (row) => row.sourceId === source.id && row.active
    );
    const spendingMonths = monthly.filter((row) => row.drawdown > 0);
    const costs = result.drawdowns.filter(
      (row) => row.fundingSourceId === source.id
    );
    const people = plan.people.flatMap((person) => {
      const rows = costs.filter((row) => row.personId === person.id);
      if (!rows.length) {
        return [];
      }
      return [
        {
          id: person.id,
          monthly: rows.map(
            ({
              fringeCost,
              indirectCost,
              month,
              percent,
              salaryCost,
              totalCost,
            }) => ({
              fringeCost,
              indirectCost,
              month,
              percent,
              salaryCost,
              totalCost,
            })
          ),
          name: person.name,
          totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0),
        },
      ];
    });
    return {
      ...source,
      ...summary,
      averageMonthlyCost: spendingMonths.length
        ? summary.totalDrawdown / spendingMonths.length
        : 0,
      firstDeficitMonth: summary.deficitMonths[0] ?? null,
      monthly,
      monthlyReductionToBreakEven: spendingMonths.length
        ? Math.max(0, -summary.remainingBalance) / spendingMonths.length
        : 0,
      people,
      spendingMonthCount: spendingMonths.length,
    };
  });
}

export function compareScenario(plan: ProjectionPlan, draft: ProjectionPlan) {
  const months = [
    ...new Set([
      ...deriveTimelineMonths(plan.fundingSources, plan.allocations),
      ...deriveTimelineMonths(draft.fundingSources, draft.allocations),
    ]),
  ].sort();
  const before = projectPlan({ ...plan, months });
  const after = projectPlan({ ...draft, months });
  return {
    after,
    before,
    months,
    sources: plan.fundingSources.map((source) => {
      const original = before.fundingSummaries.find(
        (row) => row.sourceId === source.id
      )!;
      const proposed = after.fundingSummaries.find(
        (row) => row.sourceId === source.id
      )!;
      return {
        balanceChange: proposed.remainingBalance - original.remainingBalance,
        costChange: proposed.totalDrawdown - original.totalDrawdown,
        id: source.id,
        name: source.name,
        original,
        proposed,
      };
    }),
  };
}

export function evaluatePreview(
  plan: ProjectionPlan,
  scenario: Scenario,
  asOf: string
) {
  try {
    const draft = previewScenario(plan, scenario, asOf);
    return { comparison: compareScenario(plan, draft), draft, error: null };
  } catch (error) {
    return {
      comparison: null,
      draft: null,
      error:
        error instanceof Error && error.name !== 'ZodError'
          ? error.message
          : 'Check the names, dates, and numeric values in the assumptions.',
    };
  }
}
