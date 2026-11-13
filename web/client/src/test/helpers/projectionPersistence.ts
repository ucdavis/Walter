import { HttpError } from '@/lib/api.ts';
import type {
  Projection,
  SaveProjectionRequest,
} from '@/queries/projections.ts';

type SaveOutcome = 'success' | 'failure' | 'lost-response';

function nextTimestamp(timestamp: string) {
  const [seconds, fraction = ''] = timestamp.replace(/Z$/, '').split('.');
  const ticks = Number(fraction.padEnd(7, '0')) + 1;
  return `${seconds}.${String(ticks).padStart(7, '0')}Z`;
}

/** Controllable persistence for component tests of delayed and conflicting saves. */
export function createProjectionPersistenceDouble(initialPlan: Projection) {
  let stored: Projection | null = structuredClone(initialPlan);
  let hold = false;
  let outcome: SaveOutcome = 'success';
  let reloads = 0;
  const requests: SaveProjectionRequest[] = [];
  const pending: (() => void)[] = [];
  const url = `/api/projections/${initialPlan.id}`;
  const missing = () => new HttpError(404, url, 'This plan was deleted.');

  return {
    deleteRemotely: () => {
      stored = null;
    },
    editRemotely: () => {
      if (stored) {
        stored.name = 'Plan edited by another user';
        if (stored.content.appointments[0]) {
          stored.content.appointments[0].monthlySalary = 128_000 / 12;
        }
        stored.updatedAt = nextTimestamp(stored.updatedAt);
        stored.updatedBy = 'Another user';
      }
    },
    finishNextSave: () => pending.shift()?.(),
    read: () =>
      structuredClone({ pending: pending.length, reloads, requests, stored }),
    reload: async () => {
      reloads++;
      if (!stored) {
        throw missing();
      }
      return structuredClone(stored);
    },
    resetRemotely: () => {
      if (!stored) {
        return;
      }
      const updatedAt = nextTimestamp(stored.updatedAt);
      const seededAt = nextTimestamp(stored.seededAt);
      const fresh = structuredClone(initialPlan);
      stored = {
        ...fresh,
        content: {
          ...fresh.content,
          forecastMonths: stored.content.forecastMonths,
          notes: stored.content.notes,
        },
        name: stored.name,
        seededAt,
        updatedAt,
      };
      for (const source of stored.content.fundingSources) {
        source.capturedAt = seededAt;
      }
    },
    save: async (request: SaveProjectionRequest) => {
      const submitted = structuredClone(request);
      requests.push(submitted);
      const nextOutcome = outcome;
      outcome = 'success';
      if (hold) {
        await new Promise<void>((resolve) => pending.push(resolve));
      }
      if (nextOutcome === 'failure') {
        throw new TypeError('Save request failed.');
      }
      if (!stored) {
        throw missing();
      }
      if (stored.seededAt !== submitted.expectedSeededAt) {
        throw new HttpError(409, url, {
          code: 'snapshotChanged',
          message: 'The saved snapshot was reset.',
        });
      }
      if (
        !submitted.overwrite &&
        stored.updatedAt !== submitted.expectedUpdatedAt
      ) {
        throw new HttpError(409, url, {
          code: 'conflict',
          message: 'Someone else changed this plan.',
        });
      }
      stored = {
        ...stored,
        content: submitted.content,
        name: submitted.name,
        updatedAt: nextTimestamp(stored.updatedAt),
        updatedBy: 'Test user',
      };
      if (nextOutcome === 'lost-response') {
        throw new TypeError('Save response was lost.');
      }
      return structuredClone(stored);
    },
    setHold: (value: boolean) => {
      hold = value;
    },
    setOutcome: (value: SaveOutcome) => {
      outcome = value;
    },
  };
}
