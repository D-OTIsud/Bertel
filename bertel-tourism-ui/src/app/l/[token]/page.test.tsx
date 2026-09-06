import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PublicListPage from './page';
import { getPublicList, type PublicList } from '@/services/lists';

let mockToken = 'tok-1';
jest.mock('next/navigation', () => ({
  useParams: () => ({ token: mockToken }),
}));

jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  getPublicList: jest.fn(),
}));

const getPublicListMock = getPublicList as jest.MockedFunction<typeof getPublicList>;

const baseList: PublicList = {
  name: 'Escapade Sud',
  nameEn: 'South Getaway',
  introFr: null,
  introEn: null,
  template: 'carnet',
  accent: 'teal',
  lang: 'fr',
  coverUrl: null,
  showMap: false,
  items: [],
};

describe('PublicListPage', () => {
  beforeEach(() => {
    mockToken = 'tok-1';
    getPublicListMock.mockReset();
  });

  it('shows a technical error with retry, then succeeds after retry', async () => {
    getPublicListMock.mockRejectedValueOnce(new Error('backend down'));
    render(<PublicListPage />);

    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeInTheDocument();

    getPublicListMock.mockResolvedValueOnce(baseList);
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));

    expect(await screen.findByText('Escapade Sud')).toBeInTheDocument();
    expect(getPublicListMock).toHaveBeenCalledTimes(2);
  });

  it('shows "not found" when the token resolves to null', async () => {
    getPublicListMock.mockResolvedValueOnce(null);
    render(<PublicListPage />);
    expect(await screen.findByText('Lien indisponible')).toBeInTheDocument();
  });

  it('ignores a stale resolution from a previous token', async () => {
    let resolveFirst: (value: PublicList | null) => void = () => {};
    getPublicListMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { rerender } = render(<PublicListPage />);

    mockToken = 'tok-2';
    getPublicListMock.mockResolvedValueOnce({ ...baseList, name: 'Nouvelle sélection' });
    rerender(<PublicListPage />);

    expect(await screen.findByText('Nouvelle sélection')).toBeInTheDocument();

    resolveFirst({ ...baseList, name: 'Ancienne sélection' });
    await waitFor(() => expect(screen.queryByText('Ancienne sélection')).not.toBeInTheDocument());
    expect(screen.getByText('Nouvelle sélection')).toBeInTheDocument();
  });

  it('exposes the resolved list language on the root element', async () => {
    getPublicListMock.mockResolvedValueOnce({ ...baseList, lang: 'en' });
    render(<PublicListPage />);
    const main = await screen.findByText('South Getaway');
    expect(main.closest('main')).toHaveAttribute('lang', 'en');
  });
});
