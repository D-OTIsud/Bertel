import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MediaUploadField } from './MediaUploadField';

jest.mock('../../../services/media-upload', () => ({
  uploadMedia: jest.fn(async () => ({
    url: 'https://cdn.test/media/xyz.jpg',
    width: 1600,
    height: 1200,
    mimeType: 'image/jpeg',
  })),
}));

import { uploadMedia } from '../../../services/media-upload';

describe('MediaUploadField', () => {
  beforeEach(() => {
    (uploadMedia as jest.Mock).mockClear();
  });

  it('calls uploadMedia and onUploaded with the result when the user picks a file', async () => {
    const onUploaded = jest.fn();
    render(<MediaUploadField objectId="obj-1" accessToken="t" onUploaded={onUploaded} />);

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/Téléverser un média/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadMedia).toHaveBeenCalledWith({ file, objectId: 'obj-1', accessToken: 't' });
      expect(onUploaded).toHaveBeenCalledWith({
        url: 'https://cdn.test/media/xyz.jpg',
        width: 1600,
        height: 1200,
        mimeType: 'image/jpeg',
      });
    });
  });

  it('shows an error message when the upload fails', async () => {
    (uploadMedia as jest.Mock).mockRejectedValueOnce(new Error('Unsupported MIME type: image/svg+xml'));

    render(<MediaUploadField objectId="obj-1" accessToken="t" onUploaded={jest.fn()} />);
    const input = screen.getByLabelText(/Téléverser un média/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'bad.svg', { type: 'image/svg+xml' })] },
    });

    expect(await screen.findByText(/Unsupported MIME type/i)).toBeInTheDocument();
  });
});
