import { useMemo, useRef, useState } from 'react';
import {
  ExclamationTriangleIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import type { ProjectionLookups } from '@/queries/projections.ts';
import StaffPersonDetailsModal from '@/components/guidedProjections/StaffPersonDetailsModal.tsx';
import StaffAllocationModal from '@/components/guidedProjections/StaffAllocationModal.tsx';
import StaffFundingTimeline from '@/components/guidedProjections/StaffFundingTimeline.tsx';
import { staffFundingMonths } from '@/components/guidedProjections/staffFundingTimeline.ts';
import { money } from '@/components/guidedProjections/defaults.ts';
import { formatDate } from '@/lib/date.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { useRevealItem } from '@/shared/hooks/useRevealItem.ts';
import {
  planMonths,
  hasIncorrectFundingDates,
  projectGuidedPlan,
  staffValidation,
  type PlanResult,
  type ProjectionPlan,
  type PlanStaff,
} from '@/components/guidedProjections/planModel.ts';

export default function SplitStaffEditor({
  lookups,
  plan,
  result,
  update,
}: {
  lookups?: ProjectionLookups;
  plan: ProjectionPlan;
  result?: PlanResult;
  update: (plan: ProjectionPlan) => void;
}) {
  const projection = useMemo(
    () => result ?? projectGuidedPlan(plan),
    [plan, result]
  );
  const [detailsPersonId, setDetailsPersonId] = useState<string | null>(null);
  const addedItemId = useRef<string | null>(null);
  const { registerItem, revealItem } = useRevealItem();
  const detailsPerson = plan.staff.find(
    (person) => person.id === detailsPersonId
  );
  const [allocation, setAllocation] = useState<{
    month: string;
    personId: string;
  } | null>(null);
  const editingPerson = plan.staff.find(
    (person) => person.id === allocation?.personId
  );
  const funds = plan.funding.filter((fund) =>
    plan.selectedFunding.includes(fund.id)
  );
  const months = planMonths(plan);
  function updatePerson(person: PlanStaff) {
    update({
      ...plan,
      staff: plan.staff.map((row) => (row.id === person.id ? person : row)),
    });
  }
  function addPerson() {
    const id = crypto.randomUUID();
    addedItemId.current = id;
    update({
      ...plan,
      staff: [
        ...plan.staff,
        {
          annualSalary: 60_000,
          endMonth: months.at(-1)!,
          fringeRate: 25,
          fundingId: funds[0]?.id ?? '',
          id,
          included: true,
          name: 'Planned hire',
          percent: 100,
          splits: [
            {
              endMonth: months.at(-1)!,
              fundingId: funds[0]?.id ?? '',
              id: crypto.randomUUID(),
              percent: 100,
              startMonth: plan.startMonth,
            },
          ],
          startMonth: plan.startMonth,
          ...(plan.serverProjection && {
            serverJob: {
              cbrRate: 0.25,
              colaMonth: 7,
              colaRate: 0,
              employeeId: null,
              endDate: null,
              feeRemissionMonthly: null,
              fte: 1,
              fundingEntries: [],
              id: 0,
              isSeeded: false,
              jobCode: null,
              monthlySalary: 5000,
              name: 'Planned hire',
              positionNumber: null,
              rateSet: 'DVCMP',
              startDate: null,
              title: null,
              vacationAccrualRate: 0,
            },
          }),
        },
      ],
    });
    setDetailsPersonId(id);
    revealItem(id, { focus: false });
  }
  return (
    <div className="@container">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <UserGroupIcon aria-hidden="true" className="size-5 shrink-0" />
            People & project funding
          </h2>
          <p className="text-sm leading-relaxed text-base-content/80">
            Split a person&apos;s time across projects, or change funding over
            time.
          </p>
        </div>
        <button className="btn btn-outline" onClick={addPerson} type="button">
          <PlusIcon className="size-5 shrink-0" /> Add person
        </button>
      </div>
      <p className="mb-5 rounded-md bg-base-200 px-4 py-3 leading-relaxed text-base-content/80 text-sm">
        Each share is a percentage of full-time salary. For a 50% appointment,
        shares should add up to 50%.
        {plan.serverProjection &&
          ' Outside portfolio shares count toward the appointment but do not charge these projects.'}
      </p>
      <div className="grid gap-4">
        {plan.staff.map((person) => {
          const error = person.included ? staffValidation(person, plan) : null;
          const hasExhaustedFunding = staffFundingMonths(
            person,
            plan,
            projection
          ).some((month) => month.shares.some((share) => share.exhausted));
          return (
            <article
              className="group scroll-mt-24 overflow-hidden rounded-lg border border-main-border"
              data-excluded={!person.included}
              key={person.id}
              ref={(element) => registerItem(person.id, element)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 p-3.5">
                <div className="min-w-0 group-data-[excluded=true]:opacity-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{person.name}</strong>
                    {hasExhaustedFunding && (
                      <TooltipLabel
                        asChild
                        label={
                          <span className="badge badge-soft badge-error gap-1.5">
                            <ExclamationTriangleIcon
                              aria-hidden="true"
                              className="size-4 shrink-0"
                            />
                            Funding exhausted
                          </span>
                        }
                        tooltip={
                          tooltipDefinitions.staffingFundingExhaustedExplanation
                        }
                      />
                    )}
                    {error && (
                      <TooltipLabel
                        asChild
                        label={
                          <span
                            className="badge badge-soft badge-error gap-1.5"
                            role="status"
                          >
                            <ExclamationTriangleIcon
                              aria-hidden="true"
                              className="size-4 shrink-0"
                            />
                            {person.splits.some(hasIncorrectFundingDates)
                              ? 'Incorrect funding dates'
                              : error}
                          </span>
                        }
                        tooltip={error}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-base-content/80">
                    <span className="mr-6 inline-block">
                      {person.salaryMissing
                        ? 'Salary needed'
                        : `${money(person.annualSalary)} annual salary`}
                    </span>
                    <span className="mr-6 inline-block">
                      {person.serverJob?.cbrRate === null
                        ? 'CBR needed'
                        : `${person.fringeRate}% ${plan.serverProjection ? 'CBR' : 'fringe'}`}
                    </span>
                    {person.serverJob && (
                      <>
                        <span className="mr-6 inline-block">
                          {person.serverJob.fte} FTE
                        </span>
                        <span className="inline-block">
                          Appointment end:{' '}
                          {formatDate(person.serverJob.endDate, 'Not set')}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  aria-haspopup="dialog"
                  className="btn btn-outline btn-sm ms-auto"
                  onClick={() => setDetailsPersonId(person.id)}
                  type="button"
                >
                  Salary & person details
                </button>
              </div>
              <StaffFundingTimeline
                onEdit={(month) =>
                  setAllocation({ month, personId: person.id })
                }
                person={person}
                plan={plan}
                result={projection}
              />
            </article>
          );
        })}
      </div>
      {detailsPerson && (
        <StaffPersonDetailsModal
          isServerPlan={Boolean(plan.serverProjection)}
          key={detailsPerson.id}
          lookups={lookups}
          onApply={updatePerson}
          onClose={() => {
            setDetailsPersonId(null);
            if (addedItemId.current === detailsPerson.id) {
              addedItemId.current = null;
              revealItem(detailsPerson.id);
            }
          }}
          onRemove={() => {
            update({
              ...plan,
              staff: plan.staff.filter(
                (person) => person.id !== detailsPerson.id
              ),
            });
            setDetailsPersonId(null);
            if (addedItemId.current === detailsPerson.id) {
              addedItemId.current = null;
            }
          }}
          person={detailsPerson}
        />
      )}
      {allocation && editingPerson && (
        <StaffAllocationModal
          key={`${allocation.personId}-${allocation.month}`}
          month={allocation.month}
          onApply={updatePerson}
          onClose={() => setAllocation(null)}
          person={editingPerson}
          plan={plan}
        />
      )}
    </div>
  );
}
