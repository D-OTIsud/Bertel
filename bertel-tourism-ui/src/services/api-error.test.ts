import { API_ERROR_LABELS, apiError, mapDatabaseError, networkError, readApiErrorMessage } from './api-error';

// Le brut ne doit JAMAIS atteindre l'écran : il part au journal. On espionne donc console.warn
// dans tous les cas non mappés, et on vérifie qu'aucun message rendu ne contient de brut.
let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function jsonResponse(body: unknown, status: number): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

describe('readApiErrorMessage — matrice du chantier 2026-08-28 n°4', () => {
  it('code connu ⇒ message FR de la table', () => {
    expect(readApiErrorMessage({ error: 'forbidden' }, 403)).toBe(API_ERROR_LABELS.forbidden);
    expect(readApiErrorMessage({ error: 'upload_failed' }, 500)).toBe(API_ERROR_LABELS.upload_failed);
    expect(warn).not.toHaveBeenCalled();
  });

  it('code émis DYNAMIQUEMENT par le pipeline média (mime/size/decode) ⇒ FR', () => {
    // Ces trois-là n'apparaissent dans aucun grep de littéraux (route.ts fait `error: err.code`)
    // et ce sont pourtant les plus fréquents côté utilisateur.
    expect(readApiErrorMessage({ error: 'mime' }, 415)).toBe(API_ERROR_LABELS.mime);
    expect(readApiErrorMessage({ error: 'size' }, 415)).toBe(API_ERROR_LABELS.size);
    expect(readApiErrorMessage({ error: 'decode' }, 400)).toBe(API_ERROR_LABELS.decode);
  });

  it('code INCONNU ⇒ générique FR + console.warn du brut', () => {
    const message = readApiErrorMessage({ error: 'zzz_unknown', detail: 'raw backend detail' }, 500);
    expect(message).toMatch(/^Une erreur est survenue \(code 500\)/);
    expect(message).not.toContain('zzz_unknown');
    expect(message).not.toContain('raw backend detail');
    expect(warn).toHaveBeenCalled();
  });

  it('réponse NON-JSON (payload null) ⇒ repli par statut, sans exception', () => {
    expect(readApiErrorMessage(null, 502)).toMatch(/^Une erreur est survenue \(code 502\)/);
    expect(readApiErrorMessage(null, 404)).toBe(API_ERROR_LABELS.not_found);
    expect(readApiErrorMessage(null, 401)).toBe(API_ERROR_LABELS.unauthenticated);
    expect(readApiErrorMessage(null, 429)).toBe(API_ERROR_LABELS.rate_limited);
  });

  it("ne relaie JAMAIS le nom d'une variable d'environnement", () => {
    // Les 9 routes émettaient `detail: 'SUPABASE_SERVICE_ROLE_KEY missing'` jusqu'à l'écran.
    const message = readApiErrorMessage({ error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500);
    expect(message).toBe(API_ERROR_LABELS.server_misconfigured);
    expect(message).not.toContain('SUPABASE');
  });
});

describe('codes du panneau Équipe — /api/admin/user-profile + /api/avatar/upload (Task 4)', () => {
  it('les 11 codes ajoutés ont tous une entrée FR', () => {
    const codes = [
      'unknown_field',
      'invalid_platform_role',
      'self_edit_forbidden',
      'out_of_scope',
      'owner_required',
      'email_claims_actor',
      'user_not_found',
      'email_taken',
      'profile_read_failed',
      'actor_check_failed',
      'email_update_failed',
    ];
    for (const code of codes) {
      expect(typeof API_ERROR_LABELS[code]).toBe('string');
      expect(API_ERROR_LABELS[code].length).toBeGreaterThan(0);
    }
  });

  it('owner_required contient bien "owner" (le nom du rôle exposé ailleurs dans l’écran)', () => {
    // Garde le contrat consommé par team-profile.test.ts (`rejects.toThrow(/owner/i)`) : si ce
    // libellé perd le mot, la traduction change silencieusement de comportement pour cet écran.
    expect(readApiErrorMessage({ error: 'owner_required' }, 403)).toMatch(/owner/i);
  });

  it('profile_read_failed / actor_check_failed / email_update_failed ne relaient JAMAIS le detail technique', () => {
    // Ces trois codes portent en pratique un message Postgres/GoTrue brut (souvent anglais).
    expect(readApiErrorMessage({ error: 'profile_read_failed', detail: 'permission denied for table app_user_profile' }, 500))
      .not.toContain('permission denied');
    expect(readApiErrorMessage({ error: 'actor_check_failed', detail: 'connection reset by peer' }, 500))
      .not.toContain('connection reset');
    expect(readApiErrorMessage({ error: 'email_update_failed', detail: 'AuthApiError: unexpected failure' }, 500))
      .not.toContain('AuthApiError');
  });

  it('email_taken ne relaie pas le message GoTrue brut derrière la détection "déjà pris"', () => {
    const message = readApiErrorMessage(
      { error: 'email_taken', detail: 'A user with this email address has already been registered' },
      409,
    );
    expect(message).toBe(API_ERROR_LABELS.email_taken);
    expect(message).not.toContain('already been registered');
  });

  it('unknown_field ne relaie pas le nom du champ envoyé par le client', () => {
    const message = readApiErrorMessage({ error: 'unknown_field', detail: 'isPlatformSuperuser' }, 422);
    expect(message).toBe(API_ERROR_LABELS.unknown_field);
    expect(message).not.toContain('isPlatformSuperuser');
  });
});

describe('codes des pièces jointes de tâche CRM — /api/task-document (17i)', () => {
  // Ces cinq codes sont nés d'un clone d'`actor-document`, dont la couverture était de 100 %.
  // Sans eux, l'utilisateur lisait « Une erreur est survenue (code 500) » exactement sur les
  // chemins que la route distingue avec le plus de soin (lecture ratée ≠ absence, orphelin
  // storage, bucket inattendu) : le travail de distinction était fait côté route et jeté
  // côté écran.
  const codes = [
    'task_document_create_failed',
    'link_lookup_failed',
    'document_lookup_failed',
    'storage_remove_failed',
    'unexpected_bucket',
  ];

  it('les 5 codes ont tous un libellé FR non vide', () => {
    for (const code of codes) {
      expect(typeof API_ERROR_LABELS[code]).toBe('string');
      expect(API_ERROR_LABELS[code].length).toBeGreaterThan(0);
    }
  });

  it('aucun ne relaie son detail brut (Postgres / Storage), quel que soit le statut', () => {
    // Le `detail` de ces routes est un message technique anglais : `linkError.message`,
    // `documentError.message`, `removeError.message`. La règle 1 du module interdit qu'il
    // atteigne l'écran — et c'est précisément ce qui casserait si l'un de ces codes était
    // ajouté à `CODES_WITH_BUSINESS_DETAIL` « par symétrie » avec delete_failed.
    const brut = 'permission denied for table crm_task_document';
    for (const code of codes) {
      const message = readApiErrorMessage({ error: code, detail: brut }, 500);
      expect(message).toBe(API_ERROR_LABELS[code]);
      expect(message).not.toContain('permission denied');
    }
  });

  it('le 409 unexpected_bucket ne retombe PAS sur le repli générique par statut', () => {
    // Sans son entrée, un 409 n'a aucun repli dédié : il tombait sur « Une erreur est
    // survenue (code 409) », qui ne dit ni ce qui s'est passé ni que réessayer est inutile.
    const message = readApiErrorMessage({ error: 'unexpected_bucket' }, 409);
    expect(message).toBe(API_ERROR_LABELS.unexpected_bucket);
    expect(message).not.toMatch(/code 409/);
  });

  it("storage_remove_failed dit que la pièce jointe est TOUJOURS LÀ", () => {
    // La route sort AVANT de supprimer la ligne quand le retrait du fichier échoue : si le
    // message laissait croire à une suppression, l'utilisateur ne réessaierait pas et la
    // pièce resterait, sans qu'il le sache.
    expect(API_ERROR_LABELS.storage_remove_failed).toMatch(/n'a pas été supprimée/);
  });
});

describe('apiError', () => {
  it('lit le corps JSON et rend une Error FR', async () => {
    const error = await apiError(jsonResponse({ error: 'not_found' }, 404));
    expect(error.message).toBe(API_ERROR_LABELS.not_found);
  });

  it('ne lève PAS quand le corps est illisible (HTML de proxy, corps vide)', async () => {
    const broken = {
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response;
    await expect(apiError(broken)).resolves.toBeInstanceOf(Error);
    expect((await apiError(broken)).message).toMatch(/^Une erreur est survenue \(code 502\)/);
  });
});

describe('networkError', () => {
  it('rend un message FR et journalise la cause', () => {
    const error = networkError(new TypeError('Failed to fetch'));
    expect(error.message).toMatch(/Connexion impossible/);
    expect(error.message).not.toContain('Failed to fetch');
    expect(warn).toHaveBeenCalled();
  });
});

describe('mapDatabaseError — la priorité est INVERSÉE (mapper d’abord, replier en FR ensuite)', () => {
  it('traduit les SQLSTATE connus', () => {
    expect(mapDatabaseError({ code: '23505', message: 'duplicate key value' }, 'FR').message).toMatch(/doublon/);
    expect(mapDatabaseError({ code: '23503', message: 'violates foreign key' }, 'FR').message).toMatch(/supprimé entre-temps/);
    expect(mapDatabaseError({ code: '22P02', message: 'invalid input syntax' }, 'FR').message).toMatch(/Format de valeur invalide/);
    expect(mapDatabaseError({ code: '22001', message: 'value too long' }, 'FR').message).toMatch(/trop long/);
    expect(mapDatabaseError({ code: '57014', message: 'canceling statement' }, 'FR').message).toMatch(/trop de temps/);
  });

  it('traduit la famille RLS/42501, avec ou sans code', () => {
    expect(mapDatabaseError({ code: '42501', message: 'permission denied' }, 'FR').message).toMatch(/pas autorisée/);
    expect(mapDatabaseError(new Error('new row violates row-level security policy'), 'FR').message).toMatch(/pas autorisée/);
  });

  it('SQLSTATE inconnu ⇒ le fallback FRANÇAIS du site d’appel, JAMAIS le brut anglais', () => {
    // C'est tout l'enjeu : `error.message` n'est presque jamais vide, donc l'ancien
    // `error.message || '<FR>'` n'atteignait pratiquement jamais le français.
    const error = mapDatabaseError(
      { code: 'XX000', message: 'internal error: relation "object_secret" does not exist' },
      'Chargement des listes impossible.',
    );
    expect(error.message).toBe('Chargement des listes impossible.');
    expect(error.message).not.toContain('object_secret');
    expect(warn).toHaveBeenCalled();
  });

  it('P0001 passe TEL QUEL : nos propres RAISE sont déjà en français', () => {
    const error = mapDatabaseError({ code: 'P0001', message: 'Écriture CRM non autorisée' }, 'FR par défaut');
    expect(error.message).toBe('Écriture CRM non autorisée');
  });

  it('session expirée ⇒ message actionnable', () => {
    expect(mapDatabaseError({ code: 'PGRST301', message: 'JWT expired' }, 'FR').message).toMatch(/reconnectez-vous/i);
    expect(mapDatabaseError(new Error('JWT expired'), 'FR').message).toMatch(/reconnectez-vous/i);
  });

  it('erreur vide ou inconnue ⇒ fallback, sans jamais rendre une chaîne vide', () => {
    expect(mapDatabaseError(null, 'Repli FR.').message).toBe('Repli FR.');
    expect(mapDatabaseError({}, 'Repli FR.').message).toBe('Repli FR.');
  });
});
