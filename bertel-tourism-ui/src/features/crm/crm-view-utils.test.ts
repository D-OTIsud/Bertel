import {
  PAV_TINTS,
  channelHrefOf,
  dueBadgeClassOf,
  formatRelative,
  formatShort,
  initialsOf,
  interactionAuthorOf,
  interactionTypeLabelOf,
  monthLabelOf,
  moodToneOf,
  pavTintOf,
  taskGroupOf,
  tlIcoClassOf,
  topicTintOf,
  TOPIC_TINT_COUNT,
} from './crm-view-utils';

// Réf. stable pour tous les calculs relatifs : jeudi 11 juin 2026, 12:00 locale.
const NOW = new Date(2026, 5, 11, 12, 0, 0);

describe('taskGroupOf — groupes d échéance (late/today/week/later)', () => {
  it('échéance passée (hier) → late', () => {
    expect(taskGroupOf('2026-06-10T09:00:00', NOW)).toBe('late');
  });

  it('échéance le jour même → today (peu importe l heure, même 23:59)', () => {
    expect(taskGroupOf('2026-06-11T00:05:00', NOW)).toBe('today');
    expect(taskGroupOf('2026-06-11T23:59:00', NOW)).toBe('today');
  });

  it('demain et J+7 inclus → week ; J+8 → later (borne exclue)', () => {
    expect(taskGroupOf('2026-06-12T08:00:00', NOW)).toBe('week');
    expect(taskGroupOf('2026-06-18T08:00:00', NOW)).toBe('week'); // J+7
    expect(taskGroupOf('2026-06-19T08:00:00', NOW)).toBe('later'); // J+8
  });

  it('sans échéance (null) ou date invalide → later', () => {
    expect(taskGroupOf(null, NOW)).toBe('later');
    expect(taskGroupOf('pas-une-date', NOW)).toBe('later');
  });
});

// Kanban (rectif PO point 1) : la proximité d'échéance reste portée par un badge DANS
// la carte — l'information des anciens groupes temporels n'est pas perdue.
describe('dueBadgeClassOf — badge d échéance des cartes kanban', () => {
  it('échéance passée et tâche non terminée → late (rouge)', () => {
    expect(dueBadgeClassOf('2026-06-10T09:00:00', 'todo', NOW)).toBe('late');
    expect(dueBadgeClassOf('2026-06-10T09:00:00', 'in_progress', NOW)).toBe('late');
  });

  it('échéance le jour même → today (orange)', () => {
    expect(dueBadgeClassOf('2026-06-11T18:00:00', 'todo', NOW)).toBe('today');
  });

  it('tâche done → jamais de badge (même en retard)', () => {
    expect(dueBadgeClassOf('2026-06-10T09:00:00', 'done', NOW)).toBe('');
  });

  it('échéance future ou absente → pas de badge', () => {
    expect(dueBadgeClassOf('2026-06-18T09:00:00', 'todo', NOW)).toBe('');
    expect(dueBadgeClassOf(null, 'todo', NOW)).toBe('');
  });
});

// Peps PO point 1 : sur des données 100 % « note », la couleur vient du SENTIMENT —
// 6 tons distincts (et non plus 3 classes ternes dont interrogatif tombait en gris).
describe('moodToneOf — 6 codes sentiment → 6 tons distincts (+ neutre)', () => {
  it('chaque code sentiment a son propre ton (1 pour 1)', () => {
    expect(moodToneOf('tres_positif')).toBe('tres_positif');
    expect(moodToneOf('positif')).toBe('positif');
    expect(moodToneOf('interrogatif')).toBe('interrogatif'); // ambre, plus jamais gris
    expect(moodToneOf('inquiet')).toBe('inquiet');
    expect(moodToneOf('mecontent')).toBe('mecontent');
    expect(moodToneOf('tres_mecontent')).toBe('tres_mecontent');
  });

  it('les 6 tons connus sont tous distincts (variété sur les données réelles)', () => {
    const codes = ['tres_positif', 'positif', 'interrogatif', 'inquiet', 'mecontent', 'tres_mecontent'];
    expect(new Set(codes.map((code) => moodToneOf(code))).size).toBe(6);
  });

  it('null / inconnu → neutre (gris doux), jamais null (la pastille reste rendue)', () => {
    expect(moodToneOf(null)).toBe('neutre');
    expect(moodToneOf(undefined)).toBe('neutre');
    expect(moodToneOf('autre_code')).toBe('neutre');
  });
});

describe('initialsOf', () => {
  it('prend les initiales des 2 premiers mots', () => {
    expect(initialsOf('Franck Versluys')).toBe('FV');
    expect(initialsOf('Mme Jocelyne Lebon')).toBe('MJ');
  });

  it('ignore le préfixe de forme juridique (SARL, SAS…)', () => {
    expect(initialsOf('SARL Domaine du Bel Air')).toBe('DD');
  });

  it('chaîne vide → tiret (jamais un avatar vide)', () => {
    expect(initialsOf('')).toBe('—');
  });
});

describe('pavTintOf — teinte stable par hash', () => {
  it('même clé → même teinte (stable), et la teinte vient de la palette', () => {
    const tint = pavTintOf('0d97221f-6351-4426-a5f7-c2eaecc842db');
    expect(pavTintOf('0d97221f-6351-4426-a5f7-c2eaecc842db')).toBe(tint);
    expect(PAV_TINTS).toContain(tint);
  });

  it('couvre plusieurs teintes selon la clé (pas une constante)', () => {
    const keys = ['HOT', 'RES', 'HLO', 'ASC', 'PCU', 'FMA', 'LOI', 'ITI', 'COM'];
    const distinct = new Set(keys.map((k) => pavTintOf(k)));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

// Rectif PO v5 point 1 : « les pilules sujets de teintes différentes ». L'index de teinte est
// STABLE par code (même sujet = même couleur partout) et se répartit sur la palette de 8.
describe('topicTintOf — index de teinte stable par code de sujet', () => {
  it('même code → même index (stable à travers les vues)', () => {
    const idx = topicTintOf('demande_de_visite');
    expect(topicTintOf('demande_de_visite')).toBe(idx);
  });

  it('l index reste dans [0, TOPIC_TINT_COUNT[', () => {
    const codes = ['demande_de_visite', 'modification_infos_bdd', 'reclamation', 'partenariat', 'autre'];
    for (const code of codes) {
      const idx = topicTintOf(code);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(TOPIC_TINT_COUNT);
    }
  });

  it('couvre plusieurs teintes selon le code (pas une constante)', () => {
    // Les 20 codes OTI (domaine demand_topic) : la répartition doit toucher plusieurs index.
    const codes = [
      'demande_de_visite', 'modification_infos_bdd', 'reclamation', 'partenariat', 'evenement',
      'subvention', 'classement', 'label', 'taxe_sejour', 'reseaux_sociaux', 'site_web',
      'photo', 'tarifs', 'horaires', 'accessibilite', 'durabilite', 'formation', 'adhesion',
      'mediation', 'autre',
    ];
    const distinct = new Set(codes.map((code) => topicTintOf(code)));
    expect(distinct.size).toBeGreaterThan(2);
  });

  it('code vide → 0 (jamais NaN/négatif)', () => {
    expect(topicTintOf('')).toBe(0);
  });
});

describe('formats date', () => {
  it('formatShort → JJ/MM/AAAA, null → —', () => {
    expect(formatShort('2026-06-01T08:00:00Z')).toBe('01/06/2026');
    expect(formatShort(null)).toBe('—');
  });

  it('formatRelative — minutes, heures, jours, semaines, mois', () => {
    expect(formatRelative('2026-06-11T11:30:00', NOW)).toBe('il y a 30 min');
    expect(formatRelative('2026-06-11T07:00:00', NOW)).toBe('il y a 5 h');
    expect(formatRelative('2026-06-08T12:00:00', NOW)).toBe('il y a 3 j');
    expect(formatRelative('2026-05-14T12:00:00', NOW)).toBe('il y a 4 sem.');
    expect(formatRelative('2026-01-11T12:00:00', NOW)).toBe('il y a 5 mois');
    expect(formatRelative(null, NOW)).toBe('—');
  });

  it('monthLabelOf — libellé de mois capitalisé, null → Sans date', () => {
    expect(monthLabelOf('2026-06-02T10:00:00Z')).toBe('Juin 2026');
    expect(monthLabelOf(null)).toBe('Sans date');
  });
});

describe('mappings interaction', () => {
  it('interactionTypeLabelOf — libellés FR du design v2', () => {
    expect(interactionTypeLabelOf('call')).toBe('Appel');
    expect(interactionTypeLabelOf('email')).toBe('E-mail');
    expect(interactionTypeLabelOf('visit')).toBe('Visite terrain');
    expect(interactionTypeLabelOf('note')).toBe('Note interne');
    expect(interactionTypeLabelOf('inconnu')).toBe('inconnu'); // fallback brut, jamais vide
  });

  it('tlIcoClassOf — call/mail/field, tout le reste → sys', () => {
    expect(tlIcoClassOf('call')).toBe('call');
    expect(tlIcoClassOf('email')).toBe('mail');
    expect(tlIcoClassOf('visit')).toBe('field');
    expect(tlIcoClassOf('note')).toBe('sys');
    expect(tlIcoClassOf('import')).toBe('sys');
  });
});

// Auteur affiché d'une interaction (fix « par Système ») — l'agent qui a consigné prime ;
// à défaut, l'interlocuteur (interlocutor_email) ; à défaut, une étiquette dérivée de la
// source (« Import Berta 2 » pour les lignes importées), et seulement en dernier recours
// le fallback générique « Système ». Tué le « par Système » dès qu'un auteur réel existe.
describe('interactionAuthorOf — fix « par Système »', () => {
  it('owner présent → ownerName', () => {
    expect(interactionAuthorOf({ ownerName: 'Florence', interlocutorEmail: 'x@y.re', source: 'bertel_ui' })).toBe('Florence');
  });

  it('owner null + interlocuteur → interlocutorEmail', () => {
    expect(
      interactionAuthorOf({ ownerName: null, interlocutorEmail: 'marie@basalte.re', source: 'bertel_ui' }),
    ).toBe('marie@basalte.re');
  });

  it('owner null + interlocuteur null + source import → « Import Berta 2 »', () => {
    expect(interactionAuthorOf({ ownerName: null, interlocutorEmail: null, source: 'import_berta2_crm' })).toBe(
      'Import Berta 2',
    );
  });

  it('owner null + interlocuteur null + source non-import → « Système »', () => {
    expect(interactionAuthorOf({ ownerName: null, interlocutorEmail: null, source: 'bertel_ui' })).toBe('Système');
    expect(interactionAuthorOf({ ownerName: null, interlocutorEmail: null, source: null })).toBe('Système');
  });
});

// Coordonnées cliquables (rectif PO §66+) — chaque canal devient un lien actionnable selon son
// kind_code : e-mail → mailto:, téléphones (phone/mobile/fax/whatsapp/sms) → tel: (espaces
// retirés du href, jamais du libellé affiché), site web → href http(s) externe ; tout le reste
// (ou un site sans schéma reconnaissable) → pas de lien (href null) ⇒ texte brut.
describe('channelHrefOf — coordonnées cliquables', () => {
  it('email → mailto:', () => {
    expect(channelHrefOf('email', 'marie@basalte.re')).toEqual({ href: 'mailto:marie@basalte.re', external: false });
  });

  it('téléphones (phone/mobile/fax/whatsapp/sms) → tel: sans les espaces', () => {
    expect(channelHrefOf('phone', '0262 12 34 56')).toEqual({ href: 'tel:0262123456', external: false });
    expect(channelHrefOf('mobile', '0692 11 22 33')).toEqual({ href: 'tel:0692112233', external: false });
    expect(channelHrefOf('fax', '0262 00 00 00')).toEqual({ href: 'tel:0262000000', external: false });
    expect(channelHrefOf('whatsapp', '+262 692 00 00 00')).toEqual({ href: 'tel:+262692000000', external: false });
    expect(channelHrefOf('sms', '0692 99 88 77')).toEqual({ href: 'tel:0692998877', external: false });
  });

  it('site web avec schéma → href externe ; sans schéma → préfixe https://', () => {
    expect(channelHrefOf('website', 'https://basalte.re')).toEqual({ href: 'https://basalte.re', external: true });
    expect(channelHrefOf('website', 'basalte.re')).toEqual({ href: 'https://basalte.re', external: true });
  });

  it('kind inconnu / valeur non reconnaissable → pas de lien (href null) ⇒ texte brut', () => {
    expect(channelHrefOf('messenger', 'un-pseudo-quelconque')).toEqual({ href: null, external: false });
    // Un website sans rien qui ressemble à un domaine ne devient pas un lien cassé.
    expect(channelHrefOf('website', 'à compléter')).toEqual({ href: null, external: false });
    expect(channelHrefOf('email', '')).toEqual({ href: null, external: false });
  });
});
