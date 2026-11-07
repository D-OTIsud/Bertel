import 'server-only';

export const supabaseServerFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    // Auth logs rejected fetches directly. Preserve cancellation without
    // passing the underlying message, stack or cause into the SDK.
    let interruption: 'AbortError' | 'TimeoutError' | undefined;
    if (error instanceof Error || error instanceof DOMException) {
      const { name, code } = error as Error & { code?: string | number };
      if (name === 'TimeoutError') interruption = 'TimeoutError';
      else if (name === 'AbortError' || code === 'ABORT_ERR') {
        interruption = 'AbortError';
      }
    }
    const initSignal = init?.signal;
    const signal = initSignal === undefined && input instanceof Request ? input.signal : initSignal;
    if (!interruption && signal?.aborted) interruption = 'AbortError';
    const message = 'Supabase transport request failed';
    const safeError = interruption ? new DOMException(message, interruption) : new TypeError(message);
    safeError.stack = undefined;
    throw safeError;
  }
};
