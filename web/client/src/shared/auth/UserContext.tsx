import { useMeQuery, User } from '@/queries/user.ts';
import { applyRumUserIdentity } from '@/lib/rum.ts';
import {
  blockPresentationContext,
  changePresentationProfile,
  HttpError,
  isPresentationBlocked,
  PRESENTATION_CONTEXT_EVENT,
  PRESENTATION_STORAGE_KEY,
} from '@/lib/api.ts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type UserRole =
  | 'Admin'
  | 'System'
  | 'Manager'
  | 'AccrualViewer'
  | 'FinancialViewer'
  | 'DepartmentViewer'
  | 'ProjectManager';

/**
 * React context for managing authenticated user state throughout the application.
 * We'll use it in (authenticated) routes where components can call useUser() to get the current user.
 */
const UserContext = createContext<User | undefined>(undefined);
const PresentationTransitionContext = createContext<
  ((profile: 'pi' | 'pm' | null) => Promise<void>) | undefined
>(undefined);

/**
 * Provider component that wraps the application and provides user context to all child components.
 * Shows loading and error states while fetching user data, but we should never see these states since our auth route
 * ensures user data is loaded before rendering any authenticated routes.
 */
export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const { data, error, isLoading } = useMeQuery();
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState(isPresentationBlocked);
  const [changingPresentation, setChangingPresentation] = useState(false);
  const [transitionError, setTransitionError] = useState(false);
  const presentationError = error instanceof HttpError && error.status === 409;
  const iamId = error || blocked ? undefined : data?.iamId;

  useEffect(() => {
    applyRumUserIdentity(iamId);
    return () => applyRumUserIdentity(null);
  }, [iamId]);

  useEffect(() => {
    // A transition may have occurred while this provider was unmounted on a public page.
    if (isPresentationBlocked()) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
  }, [queryClient]);

  useEffect(() => {
    let previousVisibility: string | null = null;
    const hideCachedData = () => {
      setBlocked(true);
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === PRESENTATION_STORAGE_KEY) {
        blockPresentationContext();
        hideCachedData();
      }
    };
    const onPageHide = () => {
      if (!data?.canPresent && !data?.isPresentation) {
        return;
      }
      // A browser history snapshot must not restore a visible page from an older session.
      previousVisibility = document.body.style.visibility;
      document.body.style.visibility = 'hidden';
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && previousVisibility !== null) {
        flushSync(() => {
          blockPresentationContext();
          hideCachedData();
        });
      }
      if (previousVisibility !== null) {
        document.body.style.visibility = previousVisibility;
        previousVisibility = null;
      }
    };
    window.addEventListener(PRESENTATION_CONTEXT_EVENT, hideCachedData);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(PRESENTATION_CONTEXT_EVENT, hideCachedData);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      if (previousVisibility !== null) {
        document.body.style.visibility = previousVisibility;
      }
    };
  }, [queryClient, data?.canPresent, data?.isPresentation]);

  const changePresentation = async (profile: 'pi' | 'pm' | null) => {
    setChangingPresentation(true);
    setTransitionError(false);
    try {
      await changePresentationProfile(profile);
    } catch {
      // Keep the screen closed if a transition fails; the cookie may already have changed.
      setTransitionError(true);
    } finally {
      setChangingPresentation(false);
    }
  };

  if (blocked || presentationError) {
    return (
      <main
        aria-busy={changingPresentation}
        className="container py-12 max-w-2xl"
      >
        <h1 className="h1">
          {changingPresentation
            ? 'Changing presentation…'
            : 'Presentation session paused'}
        </h1>
        <p className="my-4">
          Data is hidden because this session changed or needs to be renewed.
          Choose a presentation profile or explicitly return to Walter.
        </p>
        {transitionError && (
          <p className="alert alert-error mb-4" role="alert">
            The session could not be changed. Your data remains hidden. Please
            try again.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {(data?.canPresent || data?.isPresentation) && (
            <>
              <button
                className="btn btn-primary"
                disabled={changingPresentation}
                onClick={() => void changePresentation('pi')}
                type="button"
              >
                Start PI presentation
              </button>
              <button
                className="btn btn-primary"
                disabled={changingPresentation}
                onClick={() => void changePresentation('pm')}
                type="button"
              >
                Start PM presentation
              </button>
            </>
          )}
          <button
            className="btn btn-outline"
            disabled={changingPresentation}
            onClick={() => void changePresentation(null)}
            type="button"
          >
            End presentation and return to Walter
          </button>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="alert alert-error max-w-md">
          <svg
            className="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>Failed to load user data. Please try again later.</span>
        </div>
      </div>
    );
  }

  return (
    <PresentationTransitionContext.Provider value={changePresentation}>
      <UserContext.Provider value={data}>{children}</UserContext.Provider>
    </PresentationTransitionContext.Provider>
  );
};

export const useIsPresentation = () =>
  Boolean(useContext(UserContext)?.isPresentation);

export const usePresentationTransition = () => {
  const changePresentation = useContext(PresentationTransitionContext);
  if (!changePresentation) {
    throw new Error(
      'usePresentationTransition must be used within a UserProvider'
    );
  }
  return changePresentation;
};

/**
 * Custom hook to access the current authenticated user's information.
 */
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

/**
 * Checks if the user has any of the specified roles, or is Admin.
 * This is a convenience helper for component-level checks, not the sole source of
 * truth for route or navigation authorization.
 */
export const useHasRole = (...roles: UserRole[]) => {
  const user = useUser();
  if (user.roles.includes('Admin')) {
    return true;
  }
  return roles.some((role) => user.roles.includes(role));
};
