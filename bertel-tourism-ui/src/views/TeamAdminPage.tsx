'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSessionStore } from '@/store/session-store';
import { canAdministerTeam } from '@/store/session-selectors';
import { listOrgMembers, type OrgMember } from '@/services/rbac';
import { MembersTable } from '@/features/team/MembersTable';

export default function TeamAdminPage() {
  const role = useSessionStore((s) => s.role);
  const adminRank = useSessionStore((s) => s.adminRank);
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const allowed = canAdministerTeam({ role, adminRank });

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try { setMembers(await listOrgMembers(orgId)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  if (!allowed) return <section className="p-6"><p>Accès réservé aux administrateurs.</p></section>;
  return (
    <section className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Équipe</h1>
        {/* InviteMemberDialog mounted in Task 9 */}
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p>
        : <MembersTable members={members} currentUserId={userId} onManagePermissions={() => { /* Task 10 */ }} />}
    </section>
  );
}
