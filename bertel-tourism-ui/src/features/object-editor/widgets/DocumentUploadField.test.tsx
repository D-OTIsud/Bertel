import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentUploadField } from './DocumentUploadField';

jest.mock('../../../services/document-upload', () => ({ uploadDocument: jest.fn() }));
import { uploadDocument } from '../../../services/document-upload';

const mockedUpload = jest.mocked(uploadDocument);

describe('DocumentUploadField', () => {
  beforeEach(() => mockedUpload.mockReset());

  it('uploads the chosen file and reports the created document', async () => {
    mockedUpload.mockResolvedValue({ documentId: 'doc-1', url: 'https://cdn/x.pdf', title: 'x.pdf' });
    const onUploaded = jest.fn();
    render(<DocumentUploadField objectId="HOTRUN0000000001" accessToken="t" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText('Choisir un justificatif'), {
      target: { files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({ documentId: 'doc-1', url: 'https://cdn/x.pdf', title: 'x.pdf' }),
    );
  });

  it('accepts PDF and images', () => {
    render(<DocumentUploadField objectId="o" accessToken="t" onUploaded={jest.fn()} />);
    const accept = screen.getByLabelText('Choisir un justificatif').getAttribute('accept') ?? '';
    expect(accept).toContain('application/pdf');
    expect(accept).toContain('image/jpeg');
  });

  it('surfaces an upload error', async () => {
    mockedUpload.mockRejectedValue(new Error('413 trop volumineux'));
    render(<DocumentUploadField objectId="o" accessToken="t" onUploaded={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Choisir un justificatif'), {
      target: { files: [new File(['x'], 'big.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('413 trop volumineux');
  });
});
