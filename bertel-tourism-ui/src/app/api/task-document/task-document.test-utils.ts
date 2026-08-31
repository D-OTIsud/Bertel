// Faux clients Supabase pour les routes /api/task-document, partagés par route.test.ts et
// url/route.test.ts (les deux routes consomment le MÊME socle ./authorize : les tester
// avec le même faux garantit qu'une garde vérifiée d'un côté l'est aussi de l'autre).
//
// Le point critique est `linkTable` : un faux dont les `.eq()` ignorent leurs arguments ne
// prouve RIEN sur le filtre. Une implémentation qui ferait
// `.eq('document_id', id).eq('document_id', id)` — donc sans jamais filtrer sur la tâche —
// passerait au vert. Ici les `.eq()` filtrent RÉELLEMENT les lignes ET enregistrent les
// colonnes vues, pour que la règle de la paire (task_id, document_id) soit asservie deux
// fois : par le comportement (un document d'une autre tâche ne matche pas) et par
// l'assertion explicite sur les colonnes filtrées.

export interface LinkRow {
  task_id: string;
  document_id: string;
}

export interface FakeQueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Faux `crm_task_document` qui filtre pour de vrai sur les colonnes passées aux `.eq()`. */
export function linkTable(rows: LinkRow[], error: { message: string } | null = null) {
  const eqCalls: Array<[string, unknown]> = [];
  const withFilters = (filters: Array<[string, unknown]>) => ({
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return withFilters([...filters, [column, value]]);
    },
    maybeSingle: async (): Promise<FakeQueryResult<LinkRow>> => {
      if (error) return { data: null, error };
      const match = rows.find((row) => filters.every(
        ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value));
      return { data: match ?? null, error: null };
    },
  });
  return { eqCalls, select: () => withFilters([]) };
}

export interface DocumentRow {
  storage_bucket?: string;
  storage_path?: string;
}

/** Faux `ref_document` en lecture : rend le résultat fourni et enregistre le filtre vu. */
export function documentTable(result: FakeQueryResult<DocumentRow>) {
  const eqCalls: Array<[string, unknown]> = [];
  return {
    eqCalls,
    select: () => ({
      eq: (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return { maybeSingle: async () => result };
      },
    }),
  };
}
