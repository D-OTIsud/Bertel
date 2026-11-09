export interface SiretCardProps {
  siret: string;
  company: string;
  naf?: string;
  legalForm?: string;
  capital?: string;
  workforce?: string;
  registeredAt?: string;
}

export function SiretCard({
  siret,
  company,
  naf,
  legalForm,
  capital,
  workforce,
  registeredAt,
}: SiretCardProps) {
  return (
    <div className="siret-card">
      <div className="siret-card__head">
        <div className="siret-card__siret">{siret}</div>
      </div>
      <div className="siret-card__grid">
        <div className="siret-card__kv">
          <span className="k">Raison sociale</span>
          <span className="v">{company}</span>
        </div>
        {legalForm && (
          <div className="siret-card__kv">
            <span className="k">Forme juridique</span>
            <span className="v">{legalForm}</span>
          </div>
        )}
        {naf && (
          <div className="siret-card__kv">
            <span className="k">Code NAF</span>
            <span className="v">{naf}</span>
          </div>
        )}
        {capital && (
          <div className="siret-card__kv">
            <span className="k">Capital social</span>
            <span className="v">{capital}</span>
          </div>
        )}
        {workforce && (
          <div className="siret-card__kv">
            <span className="k">Effectif déclaré</span>
            <span className="v">{workforce}</span>
          </div>
        )}
        {registeredAt && (
          <div className="siret-card__kv">
            <span className="k">Inscription</span>
            <span className="v">{registeredAt}</span>
          </div>
        )}
      </div>
    </div>
  );
}
