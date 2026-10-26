/** Small three-way merge used only for restoring a locally saved editor draft. */
export interface DraftMergeResult<T> {
  value: T;
  conflicts: string[];
}

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function identity(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const key = typeof row.recordId === 'string' && row.recordId ? row.recordId :
    typeof row.uid === 'string' && row.uid ? row.uid : null;
  return key;
}

function duplicateIdentityPath(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    const ids = value.map(identity).filter((id): id is string => id !== null);
    if (new Set(ids).size !== ids.length) return path || 'modules';
    for (let index = 0; index < value.length; index += 1) {
      const nested = duplicateIdentityPath(value[index], `${path}[${identity(value[index]) ?? index}]`);
      if (nested) return nested;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nested = duplicateIdentityPath(child, path ? `${path}.${key}` : key);
      if (nested) return nested;
    }
  }
  return null;
}

function merge(base: unknown, local: unknown, server: unknown, path: string, conflicts: string[]): unknown {
  const ambiguous = duplicateIdentityPath(local, path)
    ?? duplicateIdentityPath(base, path)
    ?? duplicateIdentityPath(server, path);
  if (ambiguous) {
    conflicts.push(ambiguous);
    return local;
  }
  if (same(local, base)) return server;
  if (same(server, base)) return local;
  if (same(local, server)) return local;
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(server)) {
    const baseIds = base.map(identity); const localIds = local.map(identity); const serverIds = server.map(identity);
    if ([...baseIds, ...localIds, ...serverIds].some((id) => id === null)) {
      conflicts.push(path || 'modules');
      return local;
    }
    const b = new Map(base.map((row, i) => [baseIds[i] as string, row]));
    const l = new Map(local.map((row, i) => [localIds[i] as string, row]));
    const s = new Map(server.map((row, i) => [serverIds[i] as string, row]));
    const baseStableOrder = (baseIds as string[]).filter((id) => l.has(id) && s.has(id));
    const localStableOrder = (localIds as string[]).filter((id) => b.has(id) && s.has(id));
    const localReordered = !same(localStableOrder, baseStableOrder);
    const preferredOrder = localReordered
      ? [...localIds as string[], ...serverIds as string[]]
      : [...serverIds as string[], ...localIds as string[]];
    const ids = preferredOrder.filter((id, i, all) => all.indexOf(id) === i);
    const out: unknown[] = [];
    for (const id of ids) {
      const hadBase = b.has(id); const hasLocal = l.has(id); const hasServer = s.has(id);
      if (hadBase && !hasLocal) {
        if (hasServer && !same(s.get(id), b.get(id))) conflicts.push(`${path}[${id}]`);
        continue; // local explicit deletion; preserve it and let the conflict block writes
      }
      if (hadBase && !hasServer) {
        if (hasLocal && !same(l.get(id), b.get(id))) {
          // Preserve an edited local row and report the server deletion for review.
          conflicts.push(`${path}[${id}]`);
          out.push(l.get(id));
        }
        // An unchanged local row does not resurrect an explicit server deletion.
        continue;
      }
      if (hasLocal && hasServer && hadBase) {
        out.push(merge(b.get(id), l.get(id), s.get(id), `${path}[${id}]`, conflicts));
      } else if (hasLocal && hasServer && !hadBase) {
        if (!same(l.get(id), s.get(id))) conflicts.push(`${path}[${id}]`);
        out.push(l.get(id));
      } else if (hasLocal) out.push(l.get(id));
      else if (hasServer) out.push(s.get(id));
    }
    return out;
  }
  if (base && local && server && typeof base === 'object' && typeof local === 'object' && typeof server === 'object'
      && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(server)) {
    const b = base as Record<string, unknown>; const l = local as Record<string, unknown>; const s = server as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(s)])) {
      const merged = merge(b[key], l[key], s[key], path ? `${path}.${key}` : key, conflicts);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  conflicts.push(path || 'modules');
  return local;
}

export function mergeDraftAgainstServer<T>(baseline: T, localDraft: T, freshServer: T): DraftMergeResult<T> {
  const conflicts: string[] = [];
  const value = merge(baseline, localDraft, freshServer, '', conflicts) as T;
  return { value, conflicts: [...new Set(conflicts)] };
}
