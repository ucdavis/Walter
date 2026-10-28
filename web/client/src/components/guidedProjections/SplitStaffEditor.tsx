import { useState } from 'react';
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { money } from '@/components/guidedProjections/defaults.ts';
import {
  monthLabel,
  isFundingSourceActiveInMonth,
} from '@/components/projections/projection.ts';
import {
  planMonths,
  splitActive,
  staffValidation,
  type FundingSplit,
  type ProjectionPlan,
  type PlanStaff,
} from '@/components/guidedProjections/planModel.ts';

export default function SplitStaffEditor({
  plan,
  update,
}: {
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
        },
      ],
    });
    setExpanded(id);
  }
  return (
    <>
      <div className="gp-editor-heading text-base">
        <div>
          <h2 className="text-xl font-semibold">People & project funding</h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Split a person&apos;s time across projects, or change funding over
            time.
          </p>
        </div>
        <button
          className="btn btn-outline gp-secondary"
          onClick={addPerson}
          type="button"
        >
          <PlusIcon /> Add person
        </button>
      </div>
      <p className="hp-split-explainer text-sm">
        Each share is a percentage of full-time salary. For a 50% appointment,
        shares should add up to 50%.
      </p>
      <div className="hp-staff-list">
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
                    plan.selectedFunding.includes(split.fundingId)
                )
                .reduce((total, split) => total + split.percent, 0)
            );
          const min = totals.length ? Math.min(...totals) : 0;
          const max = totals.length ? Math.max(...totals) : 0;
          return (
            <article
              className={`hp-split-person ${person.included ? '' : 'hp-person-excluded'}`}
              key={person.id}
            >
              <div className="hp-person-header">
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
                  className="hp-person-toggle text-base"
                  onClick={() =>
                    setExpanded(expanded === person.id ? null : person.id)
                  }
                  type="button"
                >
                  <span>
                    <strong className="text-base">{person.name}</strong>
                    <small className="text-sm">
                      {money(person.annualSalary)} annual salary ·{' '}
                      {person.fringeRate}% fringe
                    </small>
                  </span>
                  <ChevronDownIcon />
                </button>
              </div>
              <div className="hp-split-chips text-sm">
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
                      <b>{split.percent}%</b> {fund?.name ?? 'Choose project'}
                    </button>
                  );
                })}
              </div>
              {expanded === person.id && (
                <div className="hp-person-funding" id={`funding-${person.id}`}>
                  <details className="hp-person-assumptions text-sm">
                    <summary>Salary & person details</summary>
                    <div className="hp-split-fields">
                      <label className="text-sm">
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
                      <label className="text-sm">
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
                            })
                          }
                          type="number"
                          value={person.annualSalary}
                        />
                      </label>
                      <label className="text-sm">
                        Fringe %
                        <input
                          className="input w-full text-base"
                          min={0}
                          onChange={(event) =>
                            updatePerson({
                              ...person,
                              fringeRate: nonNegativeNumber(event.target.value),
                            })
                          }
                          type="number"
                          value={person.fringeRate}
                        />
                      </label>
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
                      <fieldset className="hp-split-row" key={split.id}>
                        <legend className="text-sm">
                          Funding share {index + 1}
                        </legend>
                        <div className="hp-split-project">
                          <label className="text-sm">
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
                              {!source && (
                                <option value={split.fundingId}>
                                  Project not included
                                </option>
                              )}
                              {funds.map((fund) => (
                                <option key={fund.id} value={fund.id}>
                                  {fund.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-sm">
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
                            className="hp-remove-split"
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
                            <TrashIcon />
                          </button>
                        </div>
                        <div className="hp-split-dates">
                          <label className="text-sm">
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
                          <label className="text-sm">
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
                        {!source && (
                          <p className="hp-validation text-sm">
                            This project is excluded from the plan. This share
                            isn&apos;t charged.
                          </p>
                        )}
                        {outsideDates && (
                          <p className="hp-validation text-sm">
                            Only months within this project&apos;s{' '}
                            {monthLabel(source.startDate.slice(0, 7))} to{' '}
                            {monthLabel(source.endDate.slice(0, 7))} dates are
                            charged.
                          </p>
                        )}
                      </fieldset>
                    );
                  })}
                  <div className="hp-split-footer text-sm">
                    <button
                      className="hp-add-split text-sm"
                      disabled={!funds.length}
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
                                )?.id ?? funds[0].id,
                              id: crypto.randomUUID(),
                              percent: Math.max(0, 100 - max),
                              startMonth:
                                person.splits[0]?.startMonth ?? plan.startMonth,
                            },
                          ],
                        })
                      }
                      type="button"
                    >
                      <PlusIcon /> Add project share
                    </button>
                    <span className={error ? 'hp-negative' : ''}>
                      {min === max
                        ? `${Number(max.toFixed(1))}%`
                        : `${Number(min.toFixed(1))}% to ${Number(max.toFixed(1))}%`}{' '}
                      assigned
                    </span>
                  </div>
                  <p className="hp-split-hint text-sm">
                    To split 100% between two projects, try 60% on one and 40%
                    on the other. Each share can have its own dates.
                  </p>
                </div>
              )}
              {error && (
                <p
                  className="hp-validation hp-split-error text-sm"
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
