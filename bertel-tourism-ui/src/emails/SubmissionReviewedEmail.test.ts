// Garde de l'e-mail de résolution (Task 18) — le SEUL retour que le partenaire reçoit.
//
// Ce qui est verrouillé ici n'est pas la mise en page, c'est la COPIE : les trois issues
// (approved / rejected / partial) doivent se lire DIFFÉREMMENT. « en partie validées » n'est
// pas « validées », et un partenaire à qui l'on annonce une acceptation qui n'a pas eu lieu
// ne rouvrira jamais son espace pour corriger. Chaque assertion ci-dessous tombe si l'on
// fusionne deux issues, même « provisoirement ».
import {
  renderSubmissionReviewedEmailHtml,
  submissionReviewedEmailSubject,
  type SubmissionReviewedEmailData,
} from './SubmissionReviewedEmail';

const base: SubmissionReviewedEmailData = {
  objectName: 'Villa Vanille',
  outcome: 'approved',
  recipientName: 'Marie',
  appUrl: 'https://app.example.re/espace',
};

const approved = renderSubmissionReviewedEmailHtml({ ...base, outcome: 'approved' });
const rejected = renderSubmissionReviewedEmailHtml({ ...base, outcome: 'rejected' });
const partial = renderSubmissionReviewedEmailHtml({ ...base, outcome: 'partial' });

describe('SubmissionReviewedEmail — sujet', () => {
  it('nomme la fiche et dit l’issue, sans jargon', () => {
    expect(submissionReviewedEmailSubject(base)).toBe('Vos modifications ont été validées — Villa Vanille');
  });

  it('les TROIS issues ont trois sujets distincts', () => {
    const subjects = (['approved', 'rejected', 'partial'] as const).map((outcome) =>
      submissionReviewedEmailSubject({ ...base, outcome }),
    );
    expect(subjects).toEqual([
      'Vos modifications ont été validées — Villa Vanille',
      'Vos modifications ont été refusées — Villa Vanille',
      'Vos modifications ont été en partie validées — Villa Vanille',
    ]);
    expect(new Set(subjects).size).toBe(3);
  });

  it('échappe le nom de la fiche dans le sujet ? NON — le sujet n’est pas du HTML, il part tel quel', () => {
    // Le sujet est transporté en en-tête MIME, pas en HTML : l'échapper y ferait apparaître
    // « &lt;b&gt; » au lieu du nom. La garde d'échappement porte sur le CORPS (test plus bas).
    expect(submissionReviewedEmailSubject({ ...base, objectName: '<b>V</b>' })).toContain('<b>V</b>');
  });
});

describe('SubmissionReviewedEmail — corps, une issue = une phrase', () => {
  it('validées : annonce l’acceptation et n’appelle à AUCUNE correction', () => {
    expect(approved).toContain('Vos modifications ont été validées');
    expect(approved).toContain('Vous n’avez rien à faire');
    // Le piège : une copie unique qui parlerait de correction dans les trois cas enverrait
    // un partenaire déjà en règle chercher un problème qui n'existe pas.
    expect(approved).not.toContain('corriger');
    expect(approved).not.toContain('pas été retenue');
  });

  it('refusées : dit le refus, dit qu’un motif existe, dit où le lire', () => {
    expect(rejected).toContain('Vos modifications n’ont pas été retenues');
    expect(rejected).toContain('L’office a indiqué pourquoi');
    expect(rejected).toContain('corriger');
    expect(rejected).not.toContain('Vous n’avez rien à faire');
    // « refusées » n'est PAS « validées » : la phrase d'acceptation ne doit pas survivre ici.
    expect(rejected).not.toContain('Vos modifications ont été validées');
  });

  it('en partie validées : ni acceptation ni refus — les deux moitiés sont dites', () => {
    expect(partial).toContain('Une partie de vos modifications a été validée');
    expect(partial).toContain('L’office n’a pas retenu le reste');
    expect(partial).toContain('corriger');
    expect(partial).not.toContain('Vous n’avez rien à faire');
    expect(partial).not.toContain('Vos modifications ont été validées');
    expect(partial).not.toContain('Vos modifications n’ont pas été retenues');
  });

  it('les trois corps sont réellement différents deux à deux', () => {
    expect(new Set([approved, rejected, partial]).size).toBe(3);
  });
});

describe('SubmissionReviewedEmail — le reste du message', () => {
  it('nomme la fiche, porte le CTA vers l’espace et renvoie le détail à l’espace', () => {
    expect(approved).toContain('Villa Vanille');
    expect(approved).toContain('Fiche vérifiée');
    expect(approved).toContain('Ouvrir mon espace');
    expect(approved).toContain('https://app.example.re/espace');
    expect(rejected).toContain('dans votre espace');
  });

  it('AUCUN mot d’outil interne n’atteint le partenaire', () => {
    // Le lecteur est un partenaire, souvent sur un téléphone. Le vocabulaire de l'outil
    // (soumission, modération, module, canonique…) n'a jamais rien voulu dire pour lui, et
    // « prestataire » est proscrit à son écran.
    for (const html of [approved, rejected, partial]) {
      for (const word of [
        'prestataire', 'soumission', 'modération', 'canonique', 'module',
        'section', 'workspace', 'contributeur', 'pending', 'diff', 'RPC',
      ]) {
        expect(html.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });

  it('échappe les données venues de la DB — le nom de la fiche n’est jamais du HTML', () => {
    const html = renderSubmissionReviewedEmailHtml({ ...base, objectName: '<img src=x onerror="x()">' });
    expect(html).not.toContain('<img src=x onerror="x()">');
    expect(html).toContain('&lt;img src=x onerror=&quot;x()&quot;&gt;');
  });

  it('échappe aussi le nom du destinataire et le lien', () => {
    const html = renderSubmissionReviewedEmailHtml({
      ...base,
      recipientName: '<b>Marie</b>',
      appUrl: 'https://app.example.re/espace?x="<b>',
    });
    expect(html).not.toContain('<b>Marie</b>');
    expect(html).toContain('&lt;b&gt;Marie&lt;/b&gt;');
    expect(html).not.toContain('?x="<b>');
  });

  it('salue par le nom quand il est connu', () => {
    expect(approved).toContain('Bonjour Marie,');
  });

  it('salutation impersonnelle si le nom est absent — jamais « Bonjour null »', () => {
    const html = renderSubmissionReviewedEmailHtml({ ...base, recipientName: null });
    expect(html).toContain('Bonjour,');
    expect(html).not.toContain('null');
    expect(html).not.toMatch(/Bonjour\s+,/);
  });

  it('salutation impersonnelle AUSSI si le nom n’est que des espaces', () => {
    // `api.crm_user_label` retombe sur un libellé de repli qui n'est pas garanti non vide :
    // une garde sur la seule nullité laisserait partir « Bonjour   , ».
    const html = renderSubmissionReviewedEmailHtml({ ...base, recipientName: '   ' });
    expect(html).toContain('Bonjour,');
    expect(html).not.toMatch(/Bonjour\s+,/);
  });
});
