'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, RotateCcw, ShieldAlert } from 'lucide-react';
import { resetTestData } from '../../services/test-corpus';

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
        `${result.deleted} fiche(s) supprimée(s), ${result.reseeded?.objects ?? 0} re-semée(s).`,
      );
      toast.success('Corpus de test réinitialisé.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel-heading-block">
      <div className="panel-heading">
        <div>
          <h2>
            <FlaskConical size={18} aria-hidden="true" /> Corpus du bac à sable
          </h2>
          <p>
            L’organisation de test dispose de son propre corpus — 15 fiches de chacun des types
            d’objet, avec des acteurs fictifs. Il est cloisonné par la base : invisible depuis les
            organisations de production, et jamais servi à l’API partenaire.
          </p>
        </div>
      </div>

      <p className="form-hint">
        <ShieldAlert size={14} aria-hidden="true" /> La remise à zéro <strong>supprime toutes les
        fiches du bac à sable</strong>, y compris celles créées à la main pour un essai en cours,
        puis resème le corpus d’origine. Les données réelles ne sont jamais touchées : le serveur
        refuse d’exécuter l’opération si l’organisation visée n’est pas marquée comme organisation
        de test.
      </p>

      <label className="field">
        <span className="field__label">
          Pour confirmer, saisissez <code>REINITIALISER</code>
        </span>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="REINITIALISER"
          autoComplete="off"
          spellCheck={false}
          disabled={running}
        />
      </label>

      <button
        type="button"
        className="btn btn--danger"
        onClick={() => void handleReset()}
        disabled={!armed || running}
      >
        <RotateCcw size={16} aria-hidden="true" />
        {running ? 'Réinitialisation…' : 'Réinitialiser le corpus de test'}
      </button>

      {lastResult ? (
        <p className="form-hint" role="status">
          {lastResult}
        </p>
      ) : null}
    </div>
  );
}
