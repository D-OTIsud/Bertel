import { render, screen } from '@testing-library/react';
import OtiTemplate, { type OtiPoi } from './OtiTemplate';

// Le bloc « Un mot de votre conseiller » (AgentWord) : le prénom/nom est l'élément principal,
// l'e-mail s'affiche en dessous. Faute de nom réel (repli bootstrap = e-mail), l'e-mail ne doit
// pas apparaître deux fois. Cf. décision PO 2026-07-02.
function poi(id: string): OtiPoi {
  return {
    id, name: `Lieu ${id}`, typeCode: 'HOT', city: 'Saint-Pierre', image: null,
    subtitle: null, note: null, lat: null, lon: null, phone: null, web: null,
  };
}

function renderTemplate(over: Partial<Parameters<typeof OtiTemplate>[0]> = {}) {
  return render(
    <OtiTemplate
      template="carnet"
      lang="fr"
      accent="teal"
      name="Sélection test"
      intro="Bonjour, préparez vos papilles !"
      items={[poi('a')]}
      showMap={false}
      {...over}
    />,
  );
}

describe('OtiTemplate — mot du conseiller', () => {
  it('affiche le nom du conseiller en avant et son e-mail en dessous', () => {
    renderTemplate({ advisorName: 'David Philippe', advisorEmail: 'd.philippe@otisud.com' });
    expect(screen.getByText('David Philippe')).toBeInTheDocument();
    expect(screen.getByText('d.philippe@otisud.com')).toBeInTheDocument();
  });

  it("n'affiche pas l'e-mail deux fois quand aucun vrai nom n'est enregistré (repli = e-mail)", () => {
    const mail = 'd.philippe@otisud.com';
    renderTemplate({ advisorName: mail, advisorEmail: mail });
    expect(screen.getAllByText(mail)).toHaveLength(1);
  });

  it("affiche la photo de profil du conseiller quand elle existe (sinon initiales)", () => {
    const { container, rerender } = renderTemplate({ advisorName: 'David Philippe', advisorEmail: 'd.philippe@otisud.com' });
    // sans photo : initiales
    expect(container.querySelector('.oti-ava--photo')).toBeNull();
    expect(container.querySelector('.oti-ava')?.textContent).toBe('DP');
    // avec photo : <img>
    rerender(
      <OtiTemplate
        template="carnet" lang="fr" accent="teal" name="Sélection test"
        intro="Bonjour, préparez vos papilles !" items={[poi('a')]} showMap={false}
        advisorName="David Philippe" advisorEmail="d.philippe@otisud.com"
        advisorAvatarUrl="https://cdn/avatars/u1/avatar.jpg?v=3"
      />,
    );
    const img = container.querySelector('img.oti-ava--photo');
    expect(img?.getAttribute('src')).toBe('https://cdn/avatars/u1/avatar.jpg?v=3');
  });

  it('ne rend aucune signature sans mot du conseiller (intro vide)', () => {
    renderTemplate({ intro: null, advisorName: 'David Philippe', advisorEmail: 'd.philippe@otisud.com' });
    expect(screen.queryByText('Un mot de votre conseiller')).not.toBeInTheDocument();
  });
});
