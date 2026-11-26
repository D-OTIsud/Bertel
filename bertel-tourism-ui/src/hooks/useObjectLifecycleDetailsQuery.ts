import { useQuery } from '@tanstack/react-query';
import { getObjectLifecycleDetails } from '../services/object-versions';
import { useSessionStore } from '../store/session-store';

/** The last transition into the object's current archived or offline state. */
export function useObjectLifecycleDetailsQuery(objectId: string | null, status: 'archived' | 'hidden' | null) {
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const demoMode = useSessionStore((state) => state.demoMode);

  return useQuery({
    queryKey: ['object-lifecycle-details', objectId, status, userId, orgId, demoMode],
    queryFn: () => objectId && status ? getObjectLifecycleDetails(objectId, status) : null,
    enabled: Boolean(objectId && status),
    staleTime: 30 * 1000,
    meta: { persist: false },
  });
}
