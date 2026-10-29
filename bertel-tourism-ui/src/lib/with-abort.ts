/** Attach a signal when the builder supports it, preserving its method call and return value. */
export function withAbort<T extends PromiseLike<unknown>>(builder: T, signal?: AbortSignal): T {
  if (!signal) {
    return builder;
  }
  const withSignal = builder as T & { abortSignal?: (s: AbortSignal) => T };
  return typeof withSignal.abortSignal === 'function' ? withSignal.abortSignal(signal) : builder;
}
