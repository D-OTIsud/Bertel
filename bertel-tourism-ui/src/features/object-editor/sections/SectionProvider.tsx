import { Field, Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { SiretCard } from '../widgets/SiretCard';
import { Provenance } from '../widgets/Provenance';

const NOOP = () => undefined;

const LEGAL_FORMS = ['SARL', 'SAS', 'EI', 'SCI', 'EURL', 'SA', 'Association', 'Autre'];
const CONSULAR = ['CCI', 'CMA', "Chambre d'Agriculture", 'Aucune'];

/**
 * Section 18 — Fournisseur / Prestataire (design: edit-primitives SectionProvider).
 * Read-only per lot1_mapping_decisions §16; complements via Legal/Actors modules later.
 */
export function SectionProvider({ editor, folded }: SectionProps) {
  const module = editor.draft.provider;

  return (
    <Fs
      num="18"
      title="Fournisseur / Prestataire"
      sub="Entité juridique exploitant la fiche et informations de vérification"
      folded={folded}
      pill={{
        tone: module.sireneVerified ? 'ok' : 'warn',
        label: module.sireneVerified ? 'SIRET vérifié' : 'À vérifier',
      }}
    >
      {module.siret ? (
        <SiretCard
          siret={module.siret}
          company={module.companyName}
          naf={module.nafCode}
          legalForm={module.legalForm}
          registeredAt={module.incorporationDate}
          lastCheckedAt={module.sireneVerified ? 'SIRENE' : undefined}
        />
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 12 }}>SIRET non renseigné sur l'acteur opérateur.</p>
      )}

      {module.readonlyReason && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-4)',
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tint)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> Ces informations sont gérées par l'équipe d'administration.
        </p>
      )}

      <div className="chip-group__label" style={{ marginTop: 4 }}>Compléments éditables</div>
      <div className="provider-grid">
        <Field label="Forme juridique">
          <Select value={module.legalForm || 'SARL'} options={LEGAL_FORMS} onChange={NOOP} />
        </Field>
        <Field label="Code NAF (APE)">
          <Input value={module.nafCode} placeholder="55.10Z" mono readOnly onChange={NOOP} />
        </Field>
        <Field label="Chambre consulaire">
          <Select value={module.consularChamber || 'Aucune'} options={CONSULAR} onChange={NOOP} />
        </Field>
        <Field label="CFE (organisme)">
          <Input value={module.cfeOrganization} placeholder="CCI Réunion" readOnly onChange={NOOP} />
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Contact dirigeant</div>
      <div className="grid-3">
        <Field label="Nom complet">
          <Input value={module.directorFullName} placeholder="Nom du dirigeant" readOnly onChange={NOOP} />
        </Field>
        <Field label="E-mail dirigeant">
          <Input value={module.directorEmail} placeholder="contact@société.fr" mono readOnly onChange={NOOP} />
        </Field>
        <Field label="Téléphone dirigeant">
          <Input value={module.directorPhone} placeholder="+262 …" mono readOnly onChange={NOOP} />
        </Field>
      </div>
      <Provenance source="Prestataire" who="auto-déclaré" when="—" />

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Field label="Adresse du fournisseur">
          <Input value={module.address} placeholder="Adresse complète" readOnly onChange={NOOP} />
        </Field>
        <Field label="Date de création de la société">
          <Input value={module.incorporationDate} placeholder="JJ/MM/AAAA" mono readOnly onChange={NOOP} />
        </Field>
      </div>
      <Provenance source="INSEE" who="SIRENE" when="—" locked="OTI" />
    </Fs>
  );
}
