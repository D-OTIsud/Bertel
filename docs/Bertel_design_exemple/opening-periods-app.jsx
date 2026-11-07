/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, DCPostIt,
   OpeningPeriodsA, OpeningPeriodsB, OpeningPeriodsC, OpeningPeriodsD */

function Note({ children }) {
  return <div className="op-note">{children}</div>;
}

function App() {
  return (
    <DesignCanvas>
      <DCSection id="A" title="A · Compact side-card"
        subtitle="Vit dans le rail latéral du drawer détail, à côté de « Plan d'accès » et « Contact ». Densité maximale.">
        <DCArtboard id="A-1" label="A · Compact" width={360} height={620} style={{ background: 'var(--bg-tint)' }}>
          <div style={{ padding: 20 }}>
            <OpeningPeriodsA/>
          </div>
        </DCArtboard>
        <DCArtboard id="A-note" label="Détail des interactions" width={420} height={620} style={{ background: '#fffdf8', boxShadow: 'none', border: '1px dashed var(--line)' }}>
          <div style={{ padding: 20 }}>
            <Note>
              <h5>Trois états progressifs</h5>
              <p style={{ marginTop: 0 }}>
                La carte vit dans le rail latéral du drawer (≈320 px). Elle s'étoffe au clic sans jamais quitter le drawer — toute l'info est accessible sans ouvrir l'onglet Tarifs & horaires.
              </p>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-soft)', padding: '2px 6px', borderRadius: 4 }}>01</span>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>Replié — état par défaut</strong>
                </div>
                <ul>
                  <li>Hero cliquable : pastille verte pulsante + <strong>« Ouvert · ferme à 18:00 »</strong> + horaires du jour</li>
                  <li>Pied de carte : chip saison en cours (couleur ambre/sable) + lien <em>« Voir la semaine »</em></li>
                  <li>Hover sur le hero → fond <code>--bg-tint</code> ; chevron en bas</li>
                </ul>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-soft)', padding: '2px 6px', borderRadius: 4 }}>02</span>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>Semaine — clic sur le hero</strong>
                </div>
                <ul>
                  <li>Chevron pivote 180° ; bloc apparaît en <code>translateY(-4px)</code> + fade (220 ms)</li>
                  <li>Grille hebdo Lun→Dim : <strong>nom · barre horaire · texte</strong></li>
                  <li>Barre = segment <code>--op-high</code> positionné sur une échelle 08h–22h ; gère les coupures (ex. 09–12 + 14–18 = 2 segments)</li>
                  <li>Aujourd'hui (Jeu) : fond <code>--op-today</code>, nom en teal bold</li>
                  <li>Jour fermé (Lun) : texte gris italique, barre vide</li>
                  <li>Bandeau rouge clair : « 2 fermetures exceptionnelles à venir · 15 août, 01 nov. »</li>
                  <li>CTA pleine largeur <em>« Toutes les périodes › »</em></li>
                </ul>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-soft)', padding: '2px 6px', borderRadius: 4 }}>03</span>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>Toutes les périodes</strong>
                </div>
                <ul>
                  <li>Bouton retour <em>« ← Semaine en cours »</em> en haut</li>
                  <li>Ruban annuel compact (12 mois en 1 ligne) — segments colorés cliquables, repère orange « auj. » sur la date du jour</li>
                  <li>Échelle J-F-M…D dessous</li>
                  <li>Carte de détail : swatch + nom (avec chip <strong>« en cours »</strong> si saison active) + dates + semaine type complète</li>
                  <li>Cas « Fermeture annuelle » : pas de grille hebdo, juste une note italique</li>
                  <li>Clic sur un autre segment → la carte se met à jour instantanément</li>
                </ul>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>Liens vers l'édition</strong>
                <ul>
                  <li>Lien <em>« Modifier › »</em> dans l'en-tête : ouvre l'onglet <code>horaires</code> du drawer d'édition</li>
                  <li>Modifications persistées en data shape <code>PERIODS</code> (range, hours/jour, exceptions) — 1-pour-1 avec le modèle d'édition</li>
                </ul>
              </div>
            </Note>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="B" title="B · Bande annuelle"
        subtitle="12 mois en ligne, segments colorés par saison, marqueur « auj. ». Adapté à un site touristique où la saisonnalité est centrale.">
        <DCArtboard id="B-1" label="B · Année + semaine type" width={780} height={460} style={{ background: 'var(--bg-tint)' }}>
          <div style={{ padding: 20 }}>
            <OpeningPeriodsB/>
          </div>
        </DCArtboard>
        <DCArtboard id="B-note" label="Pour" width={300} height={460} style={{ background: '#fffdf8', boxShadow: 'none', border: '1px dashed var(--line)' }}>
          <div style={{ padding: 18 }}>
            <Note>
              <h5>Pourquoi ce format</h5>
              <p>Réservé à la zone principale du drawer (onglet Tarifs & horaires, ou bloc principal Aperçu).</p>
              <ul>
                <li><span className="ok">+</span> On voit toute la saisonnalité en 1 seconde — l'info la plus contextuelle pour le tourisme</li>
                <li><span className="ok">+</span> Le marker « auj. » sert d'ancre temporelle</li>
                <li><span className="ok">+</span> Semaine type en mini-graph (barres verticales par jour)</li>
                <li><span className="meh">−</span> Plus visuel que dense ; les heures précises demandent un clic / hover</li>
                <li><span className="meh">−</span> Demande des données calendaires propres (saisons explicites)</li>
              </ul>
            </Note>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="C" title="C · Périodes nommées"
        subtitle="Chaque saison = une carte dépliable avec son tableau hebdo. Modèle données 1-pour-1 avec ce qui est stocké côté édition.">
        <DCArtboard id="C-1" label="C · Cartes par saison" width={780} height={780} style={{ background: 'var(--bg-tint)' }}>
          <div style={{ padding: 20 }}>
            <OpeningPeriodsC/>
          </div>
        </DCArtboard>
        <DCArtboard id="C-note" label="Pour" width={300} height={780} style={{ background: '#fffdf8', boxShadow: 'none', border: '1px dashed var(--line)' }}>
          <div style={{ padding: 18 }}>
            <Note>
              <h5>Pourquoi ce format</h5>
              <p>Le plus proche du modèle de données. Chaque période a un nom, un range, des horaires hebdo distincts. Cohérent avec la logique d'édition.</p>
              <ul>
                <li><span className="ok">+</span> Très clair pour les fiches avec 2-3 saisons + exceptions</li>
                <li><span className="ok">+</span> Lecture progressive (cards repliées par défaut, sauf « en cours »)</li>
                <li><span className="ok">+</span> Le bloc « Fermetures exceptionnelles » est séparé visuellement, comme un évent log</li>
                <li><span className="ok">+</span> Aucun calcul de calendrier — robuste face aux données partielles</li>
                <li><span className="meh">−</span> Plus vertical, donc plus haut. Mieux dans l'onglet dédié</li>
              </ul>
              <p style={{ marginTop: 10 }}><strong>Recommandé</strong> comme vue principale dans l'onglet « Tarifs & horaires ».</p>
            </Note>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="D" title="D · Calendrier mensuel"
        subtitle="Une vue mois par mois, chaque jour cliquable. Pour des cas tordus : journées spéciales, fermetures à date, vérification ponctuelle.">
        <DCArtboard id="D-1" label="D · Calendrier" width={780} height={820} style={{ background: 'var(--bg-tint)' }}>
          <div style={{ padding: 20 }}>
            <OpeningPeriodsD/>
          </div>
        </DCArtboard>
        <DCArtboard id="D-note" label="Pour" width={300} height={820} style={{ background: '#fffdf8', boxShadow: 'none', border: '1px dashed var(--line)' }}>
          <div style={{ padding: 18 }}>
            <Note>
              <h5>Pourquoi ce format</h5>
              <p>Le bon outil pour répondre à « est-ce ouvert le 8 mai ? » ou « combien de jours fermés en novembre ? ».</p>
              <ul>
                <li><span className="ok">+</span> Granularité maximum : chaque jour est lisible et cliquable</li>
                <li><span className="ok">+</span> Excellent pour vérifier les exceptions (point orange)</li>
                <li><span className="ok">+</span> Toggle Année / Mois / Semaine pour passer entre vues</li>
                <li><span className="meh">−</span> Demande plus de scrolling / navigation</li>
                <li><span className="meh">−</span> Moins efficace si l'établissement n'a pas d'exceptions</li>
              </ul>
              <p style={{ marginTop: 10 }}><strong>Combo idéal</strong> : <em>A</em> dans le rail latéral + <em>C</em> en vue principale + bascule vers <em>D</em> via un toggle « calendrier ».</p>
            </Note>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="reco" title="Recommandation"
        subtitle="Mon avis sur la combinaison la plus pertinente">
        <DCArtboard id="reco-1" label="Recommandation" width={620} height={300} style={{ background: '#fffdf8' }}>
          <div style={{ padding: 24, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Ma reco</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px' }}>
              <span style={{ background: 'var(--teal-soft)', color: 'var(--teal-2)', padding: '2px 8px', borderRadius: 6 }}>A</span>
              <span style={{ color: 'var(--ink-3)' }}> dans le rail · </span>
              <span style={{ background: 'var(--teal-soft)', color: 'var(--teal-2)', padding: '2px 8px', borderRadius: 6 }}>C</span>
              <span style={{ color: 'var(--ink-3)' }}> dans l'onglet</span>
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: '0 0 12px', maxWidth: '60ch' }}>
              <strong>A</strong> donne le statut instantané sur l'aperçu — c'est la première question d'un agent OT au téléphone : « c'est ouvert maintenant ? ».
              <strong> C</strong> dans l'onglet « Tarifs & horaires » couvre la lecture éditoriale complète (toutes les saisons, toutes les exceptions) et mappe 1-pour-1 sur la structure d'édition.
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0, maxWidth: '60ch' }}>
              <strong>B</strong> et <strong>D</strong> peuvent être proposés en alternative via un toggle « Vue : liste / année / calendrier » en haut de l'onglet, sans charge supplémentaire.
            </p>
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
