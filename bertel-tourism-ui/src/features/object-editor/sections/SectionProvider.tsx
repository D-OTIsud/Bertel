import { Field, Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';

const NOOP = () => undefined;

/**
 * Plan 4 — Section 18 "Fournisseur / Prestataire".
 *
 * Mirrors `docs/Bertel_design_exemple/edit-primitives.jsx → SectionProvider`,
 * including the SIRET verification card from Plan 3.
 *
 * READ-ONLY in Plan 4 (see lot1_mapping_decisions.md §16). The values come from
 * the operator actor identity + the existing `legal` block. Editable
 * complements should be sent through the dedicated `legal` module write path
 * — surfaced here for context, not bound to a save handler.
 */

interface SiretCardProps {
  siret: string;
  companyName: string;
  verified: boolean;
}

function SiretCard({ siret, companyName, verified }: SiretCardProps) {
  // Plan 3 deliverable; presentational. A real implementation would call the
  // INSEE/SIRENE API on demand and surface a refresh affordance.
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px',
        marginBottom: 14,
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--line-soft)',
        background: verified ? 'var(--green-soft, #ecf6f0)' : 'var(--bg-tint)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.04em',
        }}
      >
        SIRET
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
          {companyName || 'Société non renseignée'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          {siret || '— SIRET non vérifié —'}
        </div>
      </div>
      <span
        className={`fs-pill ${verified ? 'ok' : 'warn'}`}
        title={verified ? 'Vérifié contre l\'API SIRENE de l\'INSEE' : 'Non vérifié'}
      >
        {verified ? 'SIRET vérifié' : 'À vérifier'}
      </span>
    </div>
  );
}

export function SectionProvider({ editor, folded }: SectionProps) {
  const module = editor.draft.provider;

  return (
    <Fs
      num="18"
      title="Fournisseur / Prestataire"
      sub="Entité juridique exploitant l'objet — données KBis vérifiées contre l'API SIRENE de l'INSEE"
      folded={folded}
      pill={{ tone: module.sireneVerified ? 'ok' : 'warn', label: module.sireneVerified ? 'SIRET vérifié' : 'À vérifier' }}
    >
      <SiretCard
        siret={module.siret}
        companyName={module.companyName}
        verified={module.sireneVerified}
      />

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
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {module.readonlyReason}
        </p>
      )}

      <div className="chip-group__label" style={{ marginTop: 4 }}>Compléments éditables</div>
      <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '0 0 8px' }}>
        Édition via les modules <strong>Légal</strong> et <strong>Acteurs</strong> — branchement direct prévu après le verrouillage du contrat d'écriture acteur-opérateur.
      </p>
      <div className="provider-grid">
        <Field label="Forme juridique">
          <Select
            value={module.legalForm || 'SARL'}
            options={['SARL', 'SAS', 'EI', 'SCI', 'EURL', 'SA', 'Association', 'Autre']}
            onChange={NOOP}
          />
        </Field>
        <Field label="Code NAF (APE)">
          <Input value={module.nafCode} placeholder="55.10Z" mono readOnly onChange={NOOP} />
        </Field>
        <Field label="Chambre consulaire">
          <Select
            value={module.consularChamber || 'Aucune'}
            options={['CCI', 'CMA', "Chambre d'Agriculture", 'Aucune']}
            onChange={NOOP}
          />
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

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Field label="Adresse du fournisseur">
          <Input value={module.address} placeholder="Adresse complète" readOnly onChange={NOOP} />
        </Field>
        <Field label="Date de création de la société">
          <Input value={module.incorporationDate} placeholder="JJ/MM/AAAA" mono readOnly onChange={NOOP} />
        </Field>
      </div>
    </Fs>
  );
}
