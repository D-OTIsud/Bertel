import type { UserRole } from '@/types/domain';

export function isSafeInternalPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

export function getDefaultAppPath(role: UserRole | null): string {
  return role === 'owner' ? '/dashboard' : '/explorer';
}

export function getLoginPath(from: string | null | undefined): string {
  return isSafeInternalPath(from) ? `/login?from=${encodeURIComponent(from)}` : '/login';
}

export function getPostLoginPath(role: UserRole | null, from: string | null | undefined): string {
  return isSafeInternalPath(from) ? from : getDefaultAppPath(role);
}
