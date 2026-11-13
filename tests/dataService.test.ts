import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localStorageService } from '../src/lib/localStorageService';

const okJson = (body: any) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const errJson = (status: number, body: any) => ({
  ok: false,
  status,
  statusText: 'Error',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RemoteDataService error handling', () => {
  const fetchMock = vi.fn();
  let intervals: Array<() => void>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    intervals = [];
    vi.stubGlobal('window', {
      setInterval: (cb: () => void) => {
        intervals.push(cb);
        return intervals.length;
      },
      clearInterval: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('query rejects instead of returning an empty collection when the read fails', async () => {
    fetchMock.mockResolvedValue(errJson(500, { error: 'Database unavailable' }));

    await expect(localStorageService.query('testQueryFail')).rejects.toThrow('Database unavailable');
  });

  it('onSnapshot reports a load error and does not emit an empty snapshot', async () => {
    fetchMock.mockResolvedValue(errJson(503, { error: 'Storage down' }));
    const onData = vi.fn();
    const onError = vi.fn();

    const unsub = (localStorageService.onSnapshot as any)('testSnapshotError', onData, onError);
    await flush();

    expect(onError).toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
    unsub();
  });

  it('skips polling refreshes while a mutation is in flight', async () => {
    const snapshots: any[] = [];
    let serverState = [{ id: 'a', n: 1 }];
    let releasePut!: (value: any) => void;
    const putPromise = new Promise((resolve) => {
      releasePut = resolve;
    });

    fetchMock.mockImplementation((_url: string, init?: any) => {
      if (init?.method === 'PUT') return putPromise;
      return Promise.resolve(okJson(serverState));
    });

    const unsub = localStorageService.onSnapshot('testPollPause', (snap) => {
      snapshots.push(snap.docs.map((d) => d.data()));
    });
    await flush();
    expect(snapshots.at(-1)).toEqual([{ id: 'a', n: 1 }]);

    const getCalls = () =>
      fetchMock.mock.calls.filter(([, init]) => !init || init.method !== 'PUT').length;
    const getsBeforeMutation = getCalls();

    const updatePromise = localStorageService.updateDoc('testPollPause', 'a', { n: 2 });
    await flush();
    expect(snapshots.at(-1)).toEqual([{ id: 'a', n: 2 }]);

    intervals.forEach((cb) => cb());
    await flush();
    expect(snapshots.at(-1)).toEqual([{ id: 'a', n: 2 }]);
    expect(getCalls()).toBe(getsBeforeMutation);

    serverState = [{ id: 'a', n: 2 }];
    releasePut(okJson({ id: 'a', n: 2 }));
    await updatePromise;
    await flush();
    expect(snapshots.at(-1)).toEqual([{ id: 'a', n: 2 }]);

    unsub();
  });
});