import { withAbort } from './with-abort';

describe('withAbort', () => {
  it('returns the same builder without reading abortSignal when no signal is supplied', () => {
    const readAbortSignal = jest.fn(() => { throw new Error('must not be read'); });
    const builder = Object.defineProperty({ then: jest.fn() }, 'abortSignal', { get: readAbortSignal });

    expect(withAbort(builder)).toBe(builder);
    expect(readAbortSignal).not.toHaveBeenCalled();
    expect(builder.then).not.toHaveBeenCalled();
  });

  it('returns the same builder when abortSignal is absent', () => {
    const builder = { then: jest.fn() };
    expect(withAbort(builder, new AbortController().signal)).toBe(builder);
    expect(builder.then).not.toHaveBeenCalled();
  });

  it.each([undefined, null, false, 'not callable', {}])(
    'reads a noncallable abortSignal once and keeps builder identity for %j', (value) => {
      const readAbortSignal = jest.fn(() => value);
      const builder = Object.defineProperty({ then: jest.fn() }, 'abortSignal', { get: readAbortSignal });

      expect(withAbort(builder, new AbortController().signal)).toBe(builder);
      expect(readAbortSignal).toHaveBeenCalledTimes(1);
      expect(builder.then).not.toHaveBeenCalled();
    },
  );

  it('reads a callable abortSignal twice and invokes the second method with the original this and signal', () => {
    const signal = new AbortController().signal;
    const returned = { then: jest.fn() };
    const firstMethod = jest.fn();
    const secondMethod = jest.fn(function (this: unknown, received: AbortSignal) {
      expect(this).toBe(builder);
      expect(received).toBe(signal);
      return returned;
    });
    const readAbortSignal = jest.fn().mockReturnValueOnce(firstMethod).mockReturnValueOnce(secondMethod);
    const builder = Object.defineProperty({ then: jest.fn() }, 'abortSignal', { get: readAbortSignal });

    expect(withAbort(builder, signal)).toBe(returned);
    expect(readAbortSignal).toHaveBeenCalledTimes(2);
    expect(firstMethod).not.toHaveBeenCalled();
    expect(secondMethod).toHaveBeenCalledTimes(1);
    expect(builder.then).not.toHaveBeenCalled();
    expect(returned.then).not.toHaveBeenCalled();
  });

  it('passes an already-aborted signal through immediately', () => {
    const controller = new AbortController();
    controller.abort();
    const builder = { then: jest.fn(), abortSignal: jest.fn() };
    builder.abortSignal.mockReturnValue(builder);

    expect(withAbort(builder, controller.signal)).toBe(builder);
    expect(builder.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(builder.then).not.toHaveBeenCalled();
  });

  it('propagates a synchronous abortSignal getter exception', () => {
    const failure = new Error('getter failed');
    const builder = Object.defineProperty({ then: jest.fn() }, 'abortSignal', { get: () => { throw failure; } });
    expect(() => withAbort(builder, new AbortController().signal)).toThrow(failure);
  });

  it('propagates a synchronous abortSignal method exception', () => {
    const failure = new Error('method failed');
    const builder = { then: jest.fn(), abortSignal: () => { throw failure; } };
    expect(() => withAbort(builder, new AbortController().signal)).toThrow(failure);
  });
});
