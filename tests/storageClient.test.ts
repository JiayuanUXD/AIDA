import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localStorageStorageService } from '../src/lib/localStorageStorage';

describe('RemoteStorageService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploadString throws with the server error when the upload is rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'Invalid filename' }),
    });

    await expect(
      localStorageStorageService.uploadString('projects/p/design.jpg', 'data:image/png;base64,xx')
    ).rejects.toThrow('Invalid filename');
  });

  it('uploadString resolves and POSTs to the upload endpoint on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, url: '/api/storage/file/projects_p_design.jpg' }),
    });

    await expect(
      localStorageStorageService.uploadString('projects/p/design.jpg', 'data:image/png;base64,xx')
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/storage/upload',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getDownloadURL uses the canonical filename returned by the upload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, url: '/api/storage/file/projects_p_design.png' }),
    });

    await localStorageStorageService.uploadString('projects/canonical/design.jpg', 'data:image/png;base64,xx');
    const url = await localStorageStorageService.getDownloadURL('projects/canonical/design.jpg');

    expect(url).toContain('/api/storage/file/projects_p_design.png');
    expect(url).not.toContain('design.jpg');
  });

  it('deleteFile issues a DELETE to the file endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '' });

    await localStorageStorageService.deleteFile('projects/p/design.jpg');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/storage/file/projects_p_design.jpg',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('deleteFile throws when the server rejects the deletion', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom' });

    await expect(localStorageStorageService.deleteFile('projects/p/design.jpg')).rejects.toThrow();
  });

  it('getDownloadURL points at the file endpoint for the flattened path', async () => {
    const url = await localStorageStorageService.getDownloadURL('projects/p/design.jpg');
    expect(url).toContain('/api/storage/file/projects_p_design.jpg');
  });
});