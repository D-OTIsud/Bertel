import { render, screen, fireEvent } from '@testing-library/react';
import { ImportExportModal } from './ImportExportModal';

function setup(overrides: Partial<React.ComponentProps<typeof ImportExportModal>> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    onExportJson: jest.fn(),
    onExportCsv: jest.fn(),
    onExportPdf: jest.fn(),
    onImportFile: jest.fn(),
    importError: null as string | null,
    ...overrides,
  };
  render(<ImportExportModal {...props} />);
  return props;
}

describe('ImportExportModal', () => {
  it('renders the three export actions', () => {
    setup();
    expect(screen.getByRole('button', { name: /exporter en json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter en csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter en pdf/i })).toBeInTheDocument();
  });

  it('fires the matching export handler on click', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /exporter en json/i }));
    expect(props.onExportJson).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /exporter en csv/i }));
    expect(props.onExportCsv).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /exporter en pdf/i }));
    expect(props.onExportPdf).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before applying an imported file, then fires onImportFile', () => {
    const props = setup();
    const file = new File(['{"format":"bertel-object"}'], 'fiche.json', { type: 'application/json' });
    const input = screen.getByLabelText(/importer un fichier json/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    // The confirm dialog is shown, not yet applied.
    expect(props.onImportFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^remplacer$/i }));
    expect(props.onImportFile).toHaveBeenCalledWith(file);
  });

  it('does not import when the overwrite confirmation is cancelled', () => {
    const props = setup();
    const file = new File(['{}'], 'fiche.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText(/importer un fichier json/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(props.onImportFile).not.toHaveBeenCalled();
  });

  it('shows an import error when provided', () => {
    setup({ importError: 'Fichier JSON invalide : aucun module reconnu à importer.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/aucun module reconnu/i);
  });

  it('annonce que l’export reflète la base, pas l’écran', () => {
    render(
      <ImportExportModal
        open
        onClose={() => {}}
        onExportJson={() => {}}
        onExportCsv={() => {}}
        onExportPdf={() => {}}
        onImportFile={() => {}}
        importError={null}
      />,
    );
    expect(screen.getByText(/telle qu.?enregistrée en base/i)).toBeInTheDocument();
  });
});
