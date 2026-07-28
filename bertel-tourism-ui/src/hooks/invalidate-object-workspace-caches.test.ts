import { QueryClient } from '@tanstack/react-query';
import { invalidateObjectWorkspaceCaches } from './useExplorerQueries';

// Garde de non-regression posee AVANT que le lot 3 ne touche a cette fonction.
// Depuis que le tiroir observe ['object-detail'], cette invalidation-la declenche
// un VRAI rechargement (1 requete) et non plus un simple marquage.
describe('invalidateObjectWorkspaceCaches', () => {
  test('invalide la fiche, l espace de travail et le catalogue de localisation', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');

    invalidateObjectWorkspaceCaches(client, 'RESRUN0000000001');

    const keys = spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['object-detail', 'RESRUN0000000001']));
    expect(keys).toContain(JSON.stringify(['object-workspace', 'RESRUN0000000001']));
    expect(keys).toContain(JSON.stringify(['location-reference-options']));
  });
});
