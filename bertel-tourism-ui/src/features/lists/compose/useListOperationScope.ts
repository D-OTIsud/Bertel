import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session-store';

export interface ListOperationScope {
  listId: string;
  userId: string | null;
  orgId: string | null;
  identity: string;
  actorEpoch: number;
  actorSignature: string;
  viewEpoch: number;
}
type Session = ReturnType<typeof useSessionStore.getState>;
const signature = (state: Session) => JSON.stringify([state.userId, state.orgId, state.status, state.role,
  state.canEditObjects, state.adminRank, state.isTestRealm, state.demoMode]);
export const obsoleteListOperation = () => new DOMException('Obsolete list operation', 'AbortError');

/** A route change can finish an earlier write into its own cache. An identity
 * change (including ABA) must prevent a paused write from acquiring another JWT. */
export function useListOperationScope(listId: string, userId: string | null, orgId: string | null, onActorChange: () => void) {
  const actorEpoch = useRef(0);
  const active = useRef(true);
  const changed = useRef(onActorChange); changed.current = onActorChange;
  const identity = `${listId}:${userId ?? ''}:${orgId ?? ''}`;
  const view = useRef({ identity, epoch: 0 });
  if (view.current.identity !== identity) view.current = { identity, epoch: view.current.epoch + 1 };
  useEffect(() => {
    active.current = true;
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (signature(next) === signature(previous)) return;
      actorEpoch.current += 1;
      changed.current();
    });
    return () => { unsubscribe(); active.current = false; actorEpoch.current += 1; };
  }, []);
  const capture = (): ListOperationScope => ({ listId, userId, orgId, identity,
    actorEpoch: actorEpoch.current, actorSignature: signature(useSessionStore.getState()), viewEpoch: view.current.epoch });
  const isSessionCurrent = (scope: ListOperationScope) => {
    const current = useSessionStore.getState();
    return active.current && scope.actorEpoch === actorEpoch.current && scope.userId === current.userId
      && scope.orgId === current.orgId && scope.actorSignature === signature(current);
  };
  const isViewCurrent = (scope: ListOperationScope) => isSessionCurrent(scope)
    && scope.viewEpoch === view.current.epoch && scope.identity === view.current.identity;
  return { capture, isSessionCurrent, isViewCurrent };
}

type Controls = ReturnType<typeof useListOperationScope>;
export function useScopedListMutation<Result, Input = void>(scopes: Controls, options: {
  mutationFn: (scope: ListOperationScope, input: Input) => Promise<Result>;
  onSuccess?: (result: Result, input: Input, scope: ListOperationScope) => void;
  onError?: (error: Error, input: Input, scope: ListOperationScope) => void;
  copy?: (input: Input) => Input;
}) {
  const mutation = useMutation({
    mutationFn: ({ scope, input }: { scope: ListOperationScope; input: Input }) => {
      // Variables were captured at the gesture, not when a paused mutationFn
      // eventually starts with TanStack's possibly replaced options.
      if (!scopes.isSessionCurrent(scope)) throw obsoleteListOperation();
      return options.mutationFn(scope, input);
    },
    onSuccess: (result, { scope, input }) => {
      if (scopes.isSessionCurrent(scope)) options.onSuccess?.(result, input, scope);
    },
    onError: (error, { scope, input }) => {
      if (scopes.isViewCurrent(scope)) options.onError?.(error, input, scope);
    },
  });
  const request = (input: Input, scope = scopes.capture()) => ({ scope, input: options.copy ? options.copy(input) : input });
  return { ...mutation,
    variables: mutation.variables?.input,
    isPending: mutation.isPending && scopes.isViewCurrent(mutation.variables.scope),
    mutate: (input: Input, scope?: ListOperationScope) => mutation.mutate(request(input, scope)),
    mutateAsync: (input: Input, scope?: ListOperationScope) => mutation.mutateAsync(request(input, scope)),
  };
}
