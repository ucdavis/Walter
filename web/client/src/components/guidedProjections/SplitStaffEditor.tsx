import { useState } from 'react';
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import type {
  ProjectionJob,
  ProjectionLookups,
} from '@/queries/projections.ts';
import { money } from '@/components/guidedProjections/defaults.ts';
import {
  monthLabel,
  isFundingSourceActiveInMonth,
} from '@/components/projections/projection.ts';
import {
  OUTSIDE_FUNDING_ID,
  planMonths,
  splitActive,
  staffValidation,
  type FundingSplit,
  type ProjectionPlan,
  type PlanStaff,
} from '@/components/guidedProjections/planModel.ts';

export default function SplitStaffEditor({
  lookups,
  plan,
  update,
}: {
  lookups?: ProjectionLookups;
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    plan.staff[0]?.id ?? null
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
  function updateSplit(person: PlanStaff, split: FundingSplit) {
    updatePerson({
      ...person,
      splits: person.splits.map((row) => (row.id === split.id ? split : row)),
    });
  }
  function addPerson() {
    const id = crypto.randomUUID();
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
    setExpanded(id);
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <UserGroupIcon aria-hidden="true" className="size-5 shrink-0" />
            People & project funding
          </h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Split a person&apos;s time across projects, or change funding over
            time.
          </p>
        </div>
        <button className="btn btn-outline" onClick={addPerson} type="button">
          <PlusIcon className="size-5 shrink-0" /> Add person
        </button>
      </div>
      <p className="mb-5 rounded-md bg-base-200 px-4 py-3 leading-relaxed text-base-content/70 text-sm">
        Each share is a percentage of full-time salary. For a 50% appointment,
        shares should add up to 50%.
        {plan.serverProjection &&
          ' Outside portfolio shares count toward the appointment but do not charge these projects.'}
      </p>
      <div className="grid gap-4">
        {plan.staff.map((person) => {
          const error = person.included ? staffValidation(person, plan) : null;
          const totals = months
            .filter((month) =>
              person.splits.some((split) => splitActive(split, month))
            )
            .map((month) =>
              person.splits
                .filter(
                  (split) =>
                    splitActive(split, month) &&
                    (plan.selectedFunding.includes(split.fundingId) ||
                      split.fundingId === OUTSIDE_FUNDING_ID)
                )
                .reduce((total, split) => total + split.percent, 0)
            );
          const min = totals.length ? Math.min(...totals) : 0;
          const max = totals.length ? Math.max(...totals) : 0;
          return (
            <article
              className="group overflow-hidden rounded-lg border border-main-border"
              data-excluded={!person.included}
              key={person.id}
            >
              <div className="flex items-center gap-2.5 p-3.5">
                <input
                  aria-label={`Include ${person.name}`}
                  checked={person.included}
                  className="checkbox checkbox-primary checkbox-sm"
                  onChange={(event) =>
                    updatePerson({ ...person, included: event.target.checked })
                  }
                  type="checkbox"
                />
                <button
                  aria-controls={`funding-${person.id}`}
                  aria-expanded={expanded === person.id}
                  className="flex flex-1 items-center justify-between gap-3 text-left group-data-[excluded=true]:opacity-50 [&_small]:mt-1 [&_small]:block [&_small]:text-base-content/70 [&>svg]:size-4 [&>svg]:transition-transform aria-expanded:[&>svg]:rotate-180 text-base"
                  onClick={() =>
                    setExpanded(expanded === person.id ? null : person.id)
                  }
                  type="button"
                >
                  <span>
                    <strong className="text-base">{person.name}</strong>
                    <small className="text-sm">
                      {person.salaryMissing
                        ? 'Salary needed'
                        : `${money(person.annualSalary)} annual salary`}{' '}
                      ·{' '}
                      {person.serverJob?.cbrRate === null
                        ? 'CBR needed'
                        : `${person.fringeRate}% ${plan.serverProjection ? 'CBR' : 'fringe'}`}
                      {person.serverJob && ` · ${person.serverJob.fte} FTE`}
                    </small>
                  </span>
                  <ChevronDownIcon className="size-5 shrink-0" />
                </button>
              </div>
              <div className="grid gap-1.5 px-3.5 pb-3.5 sm:ps-9 group-data-[excluded=true]:opacity-50 [&>button]:text-left [&>button]:leading-normal [&>button]:text-base-content/70 [&_b]:me-1 [&_i]:me-1.5 [&_i]:inline-block [&_i]:size-2 [&_i]:shrink-0 [&_i]:rounded-full text-sm">
                {person.splits.map((split) => {
                  const fund = plan.funding.find(
                    (row) => row.id === split.fundingId
                  );
                  return (
                    <button
                      key={split.id}
                      onClick={() => setExpanded(person.id)}
                      type="button"
                    >
                      <i style={{ background: fund?.color }} />
                      <b>{Number(split.percent.toFixed(2))}%</b>{' '}
                      {split.fundingId === OUTSIDE_FUNDING_ID
                        ? 'Outside portfolio'
                        : fund
                          ? fundingLabel(fund)
                          : 'Choose project'}
                    </button>
                  );
                })}
              </div>
              {expanded === person.id && (
                <div
                  className="border-t border-main-border bg-base-200 p-3 sm:p-3.5"
                  id={`funding-${person.id}`}
                >
                  <details className="mb-4 [&>summary]:cursor-pointer [&>summary]:text-base-content/70 text-sm">
                    <summary>Salary & person details</summary>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 [&>label:first-child]:col-span-full">
                      <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                        Name
                        <input
                          className="input w-full text-base"
                          onChange={(event) =>
                            updatePerson({
                              ...person,
                              name: event.target.value,
                            })
                          }
                          value={person.name}
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                        Annual full-time salary
                        <input
                          className="input w-full text-base"
                          min={0}
                          onChange={(event) =>
                            updatePerson({
                              ...person,
                              annualSalary: nonNegativeNumber(
                                event.target.value
                              ),
                              salaryMissing: plan.serverProjection
                                ? event.target.value === ''
                                : undefined,
                            })
                          }
                          type="number"
                          value={
                            person.salaryMissing ? '' : person.annualSalary
                          }
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                        {plan.serverProjection ? 'CBR %' : 'Fringe %'}
                        <input
                          className="input w-full text-base"
                          min={0}
                          onChange={(event) =>
                            updatePerson({
                              ...person,
                              fringeRate: nonNegativeNumber(event.target.value),
                              ...(person.serverJob && {
                                serverJob: {
                                  ...person.serverJob,
                                  cbrRate:
                                    event.target.value === ''
                                      ? null
                                      : nonNegativeNumber(event.target.value) /
                                        100,
                                },
                              }),
                            })
                          }
                          type="number"
                          value={
                            person.serverJob?.cbrRate === null
                              ? ''
                              : person.fringeRate
                          }
                        />
                      </label>
                      {person.serverJob && (
                        <JobDetails
                          lookups={lookups}
                          person={person}
                          update={updatePerson}
                        />
                      )}
                    </div>
                  </details>
                  {person.splits.map((split, index) => {
                    const source = funds.find(
                      (fund) => fund.id === split.fundingId
                    );
                    const outsideDates =
                      source &&
                      months.some(
                        (month) =>
                          splitActive(split, month) &&
                          !isFundingSourceActiveInMonth(source, month)
                      );
                    return (
                      <fieldset
                        className="mb-3 min-w-0 rounded-md border border-main-border bg-base-200 p-2 sm:p-3 [&>legend]:px-1 [&>legend]:text-base-content/70"
                        key={split.id}
                      >
                        <legend className="text-sm">
                          Funding share {index + 1}
                        </legend>
                        <div className="grid grid-cols-[minmax(0,1fr)_4rem_1.25rem] items-end gap-1.5 sm:grid-cols-[minmax(0,1fr)_4.5rem_1.5rem] sm:gap-2">
                          <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                            Project
                            <select
                              aria-label={`${person.name} project ${index + 1}`}
                              className="select w-full text-base"
                              onChange={(event) =>
                                updateSplit(person, {
                                  ...split,
                                  fundingId: event.target.value,
                                })
                              }
                              value={split.fundingId}
                            >
                              {plan.serverProjection && (
                                <option value={OUTSIDE_FUNDING_ID}>
                                  Outside portfolio
                                </option>
                              )}
                              {!source &&
                                split.fundingId !== OUTSIDE_FUNDING_ID && (
                                  <option value={split.fundingId}>
                                    Project not included
                                  </option>
                                )}
                              {funds.map((fund) => (
                                <option key={fund.id} value={fund.id}>
                                  {fundingLabel(fund)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                            Share %
                            <input
                              aria-label={`${person.name} share ${index + 1}`}
                              className="input w-full text-base"
                              max={100}
                              min={0}
                              onChange={(event) =>
                                updateSplit(person, {
                                  ...split,
                                  percent: nonNegativeNumber(
                                    event.target.value
                                  ),
                                })
                              }
                              step={1}
                              type="number"
                              value={split.percent}
                            />
                          </label>
                          <button
                            aria-label={`Remove ${person.name} funding share ${index + 1}`}
                            className="py-2 text-error [&>svg]:size-4"
                            onClick={() =>
                              updatePerson({
                                ...person,
                                splits: person.splits.filter(
                                  (row) => row.id !== split.id
                                ),
                              })
                            }
                            type="button"
                          >
                            <TrashIcon className="size-5 shrink-0" />
                          </button>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                          <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                            From
                            <input
                              aria-label={`${person.name} share ${index + 1} from`}
                              className="input w-full text-base"
                              onChange={(event) =>
                                updateSplit(person, {
                                  ...split,
                                  startMonth: event.target.value,
                                })
                              }
                              type="month"
                              value={split.startMonth}
                            />
                          </label>
                          <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
                            Through
                            <input
                              aria-label={`${person.name} share ${index + 1} through`}
                              className="input w-full text-base"
                              onChange={(event) =>
                                updateSplit(person, {
                                  ...split,
                                  endMonth: event.target.value,
                                })
                              }
                              type="month"
                              value={split.endMonth}
                            />
                          </label>
                        </div>
                        {!source && split.fundingId !== OUTSIDE_FUNDING_ID && (
                          <p className="mt-4 rounded-md bg-error/10 p-3 text-error text-sm">
                            This project is excluded from the plan. This share
                            isn&apos;t charged.
                          </p>
                        )}
                        {outsideDates && (
                          <p className="mt-4 rounded-md bg-error/10 p-3 text-error text-sm">
                            Only months within this project&apos;s{' '}
                            {monthLabel(source.startDate.slice(0, 7))} to{' '}
                            {monthLabel(source.endDate.slice(0, 7))} dates are
                            charged.
                          </p>
                        )}
                      </fieldset>
                    );
                  })}
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <button
                      className="flex items-center gap-1.5 font-semibold text-primary [&>svg]:size-4 text-sm"
                      disabled={!funds.length && !plan.serverProjection}
                      onClick={() =>
                        updatePerson({
                          ...person,
                          splits: [
                            ...person.splits,
                            {
                              endMonth:
                                person.splits[0]?.endMonth ?? months.at(-1)!,
                              fundingId:
                                funds.find(
                                  (fund) =>
                                    !person.splits.some(
                                      (split) => split.fundingId === fund.id
                                    )
                                )?.id ??
                                funds[0]?.id ??
                                OUTSIDE_FUNDING_ID,
                              id: crypto.randomUUID(),
                              percent: Math.max(
                                0,
                                (person.serverJob?.fte ?? 1) * 100 - max
                              ),
                              startMonth:
                                person.splits[0]?.startMonth ?? plan.startMonth,
                            },
                          ],
                        })
                      }
                      type="button"
                    >
                      <PlusIcon className="size-5 shrink-0" /> Add project share
                    </button>
                    <span className={error ? 'text-error' : ''}>
                      {min === max
                        ? `${Number(max.toFixed(1))}%`
                        : `${Number(min.toFixed(1))}% to ${Number(max.toFixed(1))}%`}{' '}
                      assigned
                    </span>
                  </div>
                  <p className="mt-3 leading-relaxed text-base-content/70 text-sm">
                    To split 100% between two projects, try 60% on one and 40%
                    on the other. Each share can have its own dates.
                  </p>
                </div>
              )}
              {error && (
                <p
                  className="mt-4 rounded-md bg-error/10 p-3 text-error m-0 rounded-none px-3.5 py-2.5 text-sm"
                  role="status"
                >
                  {error}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function nonNegativeNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function JobDetails({
  lookups,
  person,
  update,
}: {
  lookups?: ProjectionLookups;
  person: PlanStaff;
  update: (person: PlanStaff) => void;
}) {
  const job = person.serverJob!;
  const patch = (changes: Partial<ProjectionJob>) =>
    update({ ...person, serverJob: { ...job, ...changes } });
  const jobCodeValue = `${job.rateSet}|${job.jobCode ?? ''}`;
  const hasJobCode = lookups?.jobCodes.some(
    (code) => `${code.rateSet}|${code.jobCode}` === jobCodeValue
  );

  return (
    <>
      <label className="col-span-full grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
        Job code and rate set
        <select
          className="select w-full text-base"
          onChange={(event) => {
            const code = lookups?.jobCodes.find(
              (entry) =>
                `${entry.rateSet}|${entry.jobCode}` === event.target.value
            );
            if (code) {
              update({
                ...person,
                fringeRate: (code.cbr ?? 0) * 100,
                serverJob: {
                  ...job,
                  cbrRate: code.cbr,
                  jobCode: code.jobCode,
                  rateSet: code.rateSet,
                  title: code.title,
                  vacationAccrualRate: code.vacationAccrual ?? 0,
                },
              });
            }
          }}
          value={jobCodeValue}
        >
          {!hasJobCode && (
            <option value={jobCodeValue}>
              {job.jobCode
                ? `${job.jobCode} · ${job.rateSet}`
                : 'Choose job code'}
            </option>
          )}
          {lookups?.jobCodes.map((code) => (
            <option
              key={`${code.rateSet}|${code.jobCode}`}
              value={`${code.rateSet}|${code.jobCode}`}
            >
              {code.jobCode} · {code.title ?? 'Untitled job'} · {code.rateSet}
            </option>
          ))}
        </select>
      </label>
      <JobNumber
        label="Appointment FTE"
        max={1}
        onChange={(value) => {
          const fte = value ?? 0;
          update({
            ...person,
            serverJob: { ...job, fte },
            // Keep the funding distribution unchanged when appointment effort changes.
            splits: person.splits.map((split) => ({
              ...split,
              percent:
                job.fte > 0
                  ? (split.percent * fte) / job.fte
                  : (split.serverEntry?.percent ?? 0) * fte * 100,
            })),
          });
        }}
        step={0.01}
        value={job.fte}
      />
      <JobNumber
        label="Vacation accrual %"
        onChange={(value) => patch({ vacationAccrualRate: (value ?? 0) / 100 })}
        value={job.vacationAccrualRate * 100}
      />
      <JobNumber
        label="Annual COLA %"
        onChange={(value) => patch({ colaRate: (value ?? 0) / 100 })}
        value={job.colaRate * 100}
      />
      <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
        COLA month
        <select
          className="select w-full text-base"
          onChange={(event) => patch({ colaMonth: Number(event.target.value) })}
          value={job.colaMonth}
        >
          {[
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ].map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <JobNumber
        label="Monthly fee remission"
        onChange={(value) => patch({ feeRemissionMonthly: value })}
        value={job.feeRemissionMonthly}
      />
      <div className="col-span-full grid grid-cols-2 gap-2.5">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
          Appointment starts
          <input
            className="input w-full text-base"
            max={job.endDate ?? undefined}
            onChange={(event) =>
              patch({ startDate: event.target.value || null })
            }
            type="date"
            value={job.startDate ?? ''}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
          Appointment ends
          <input
            className="input w-full text-base"
            min={job.startDate ?? undefined}
            onChange={(event) => patch({ endDate: event.target.value || null })}
            type="date"
            value={job.endDate ?? ''}
          />
        </label>
      </div>
      <p className="col-span-full text-sm font-normal text-base-content/70">
        Blank appointment dates leave the job open for the planning period. Fee
        remission is the monthly total for the appointment.
      </p>
      {(person.salaryMissing || job.cbrRate === null) && (
        <p className="col-span-full text-sm font-normal text-warning">
          Enter the missing salary or CBR before relying on this projection.
          Missing values currently contribute zero cost.
        </p>
      )}
    </>
  );
}

function JobNumber({
  label,
  max,
  onChange,
  step = 'any',
  value,
}: {
  label: string;
  max?: number;
  onChange: (value: number | null) => void;
  step?: number | 'any';
  value: number | null;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
      {label}
      <input
        className="input w-full text-base"
        max={max}
        min={0}
        onChange={(event) =>
          onChange(
            event.target.value === ''
              ? null
              : nonNegativeNumber(event.target.value)
          )
        }
        step={step}
        type="number"
        value={value === null ? '' : Number(value.toFixed(6))}
      />
    </label>
  );
}

function fundingLabel(fund: ProjectionPlan['funding'][number]) {
  return fund.serverProject?.taskNumber
    ? `${fund.name} · Task ${fund.serverProject.taskNumber}`
    : fund.name;
}
