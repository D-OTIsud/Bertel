'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FlaskConical, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { resetTestData } from '../../services/test-corpus';
import './settings-panels.css';

/**
 * Corpus du bac à sable — remise à zéro (super-admin).
 *
 * Le bouton n'est qu'une commodité : la RPC est gardée deux fois côté serveur
 * (superuser plateforme, et refus si l'organisation visée n'est pas `is_test_org`)
 * et ne prend aucun argument, donc elle ne peut pas être pointée ailleurs.
 *
 * La confirmation par saisie n'est pas décorative : l'action est destructive et
 * irréversible pour ce qu'un testeur aurait construit à la main dans le bac à
 * sable. Un simple « Êtes-vous sûr ? » se clique sans être lu.
 */
export function TestCorpusSettings() {
  const [confirm, setConfirm] = useState('');
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const armed = confirm.trim().toUpperCase() === 'REINITIALISER';

  const handleReset = async () => {
    if (!armed) return;
    setRunning(true);
    try {
      const result = await resetTestData();
      setConfirm('');
      setLastResult(
        `${result.deleted} fiche(s) supprimée(s), ${result.reseeded?.objects ?? 0} recréée(s).`,
      );
      toast.success('Corpus de test réinitialisé.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="settings-pane settings-admin" aria-labelledby="test-corpus-heading">
      <div className="settings-pane__head settings-admin__header">
        <div className="settings-admin__heading">
          <span className="settings-admin__icon"><FlaskConical size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="test-corpus-heading">Corpus de test</h2>
            <p>Gérez les données du bac à sable pour les démonstrations et les essais.</p>
          </div>
        </div>
        <span className="badge badge--info badge--xs">Super-admin</span>
      </div>

      <div className="settings-admin__body">
        <section className="settings-admin__section" aria-labelledby="test-corpus-content-heading">
          <div className="settings-admin__section-head">
            <div>
              <h3 id="test-corpus-content-heading">Un environnement pour expérimenter</h3>
              <p>Un jeu de données fictives dédié à l’organisation de test.</p>
            </div>
            <span className="badge badge--ok">Bac à sable</span>
          </div>
          <dl className="settings-admin__facts">
            <div><dt>Fiches</dt><dd>15 par type d’objet</dd></div>
            <div><dt>Acteurs</dt><dd>Données fictives</dd></div>
            <div><dt>Accès</dt><dd>Organisation de test</dd></div>
          </dl>
          <div className="settings-admin__note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>Ces fiches sont invisibles depuis les organisations de production et ne sont jamais diffusées par l’API partenaire.</p>
          </div>
        </section>

        <section className="settings-admin__section settings-admin__section--danger" aria-labelledby="test-corpus-reset-heading">
          <div className="settings-admin__section-head">
            <div>
              <h3 id="test-corpus-reset-heading">Réinitialiser le corpus</h3>
              <p>Retrouvez le jeu de données d’origine pour un nouvel essai.</p>
            </div>
            <RotateCcw size={18} className="settings-admin__danger-action" aria-hidden="true" />
          </div>
          <div className="settings-admin__note settings-admin__note--danger" id="test-corpus-reset-warning">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>Toutes les fiches du bac à sable seront supprimées.</strong>
              <p>Les fiches ajoutées ou modifiées pendant vos essais seront perdues, puis le corpus d’origine sera recréé. Cette action est irréversible.</p>
            </div>
          </div>
          <p className="settings-admin__hint">Seule l’organisation de test est concernée. Les données des organisations de production sont conservées.</p>
          <div className="settings-admin__field settings-admin__field--confirmation">
            <label htmlFor="test-corpus-confirm">Pour confirmer, saisissez <code>REINITIALISER</code></label>
            <input
              id="test-corpus-confirm"
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="REINITIALISER"
              autoComplete="off"
              spellCheck={false}
              disabled={running}
              aria-describedby="test-corpus-reset-warning"
            />
          </div>
          <div className="settings-admin__footer">
            <button
              type="button"
              className="primary-button primary-button--danger settings-admin__danger-button"
              onClick={() => void handleReset()}
              disabled={!armed || running}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {running ? 'Réinitialisation…' : 'Réinitialiser le corpus de test'}
            </button>
          </div>
          {lastResult && (
            <div className="settings-admin__note settings-admin__note--success" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <div><strong>Corpus réinitialisé</strong><p>{lastResult}</p></div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
