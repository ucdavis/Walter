import { useState } from 'react';
import {
  usePresentationTransition,
  useUser,
} from '@/shared/auth/UserContext.tsx';

/** Presenter controls stay visible through every authenticated drilldown. */
export function PresentationControls() {
  const user = useUser();
  const changePresentation = usePresentationTransition();
  const [profile, setProfile] = useState<'pi' | 'pm'>(
    user.presentationProfile ?? 'pi'
  );

  if (!user.canPresent && !user.isPresentation) {
    return null;
  }

  return (
    <section
      aria-label="Presentation controls"
      className="bg-warning/20 border-b border-warning px-6 py-3 flex flex-wrap items-center gap-3"
    >
      {user.isPresentation ? (
        <p className="font-bold" role="status">
          Presentation — fictional data · {user.name}
        </p>
      ) : (
        <span className="font-bold">Presentation profiles</span>
      )}
      <label className="flex items-center gap-2">
        <span>Profile</span>
        <select
          className="select select-sm w-auto"
          onChange={(event) =>
            setProfile(event.target.value === 'pm' ? 'pm' : 'pi')
          }
          value={profile}
        >
          <option value="pi">Principal Investigator</option>
          <option value="pm">Project Manager</option>
        </select>
      </label>
      <button
        className="btn btn-sm btn-primary"
        onClick={() => void changePresentation(profile)}
        type="button"
      >
        {user.isPresentation ? 'Switch profile' : 'Start presentation'}
      </button>
      {user.isPresentation && (
        <button
          className="btn btn-sm btn-outline"
          onClick={() => void changePresentation(null)}
          type="button"
        >
          End presentation
        </button>
      )}
    </section>
  );
}
