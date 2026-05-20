import { renderHook, act } from '@testing-library/react';
import { UNSAVED_DRAFT_LEAVE_MESSAGE, useUnsavedDraftGuard } from './useUnsavedDraftGuard';

describe('useUnsavedDraftGuard', () => {
  let confirmSpy: jest.MockedFunction<typeof window.confirm>;
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.fn(() => true);
    window.confirm = confirmSpy;
    addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    jest.spyOn(document, 'addEventListener');
    jest.spyOn(document, 'removeEventListener');
    window.history.pushState = jest.fn();
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost/objects/o1/edit',
        pathname: '/objects/o1/edit',
        search: '',
        origin: 'http://localhost',
      },
      writable: true,
      configurable: true,
    });
    window.history.pushState({}, '', 'http://localhost/objects/o1/edit');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirmLeave returns true when draft is clean', () => {
    const { result } = renderHook(() => useUnsavedDraftGuard(false));
    expect(result.current.confirmLeave()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirmLeave asks before leaving when draft is dirty', () => {
    confirmSpy.mockReturnValue(false);
    const { result } = renderHook(() => useUnsavedDraftGuard(true));
    expect(result.current.confirmLeave()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_DRAFT_LEAVE_MESSAGE);
  });

  it('registers beforeunload while dirty and removes it on cleanup', () => {
    const { unmount } = renderHook(() => useUnsavedDraftGuard(true));
    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('blocks same-origin link navigation when user declines', () => {
    confirmSpy.mockReturnValue(false);
    renderHook(() => useUnsavedDraftGuard(true));

    const anchor = document.createElement('a');
    anchor.href = 'http://localhost/explorer';
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const preventDefault = jest.spyOn(event, 'preventDefault');
    const stopImmediatePropagation = jest.spyOn(event, 'stopImmediatePropagation');

    act(() => {
      anchor.dispatchEvent(event);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
    document.body.removeChild(anchor);
  });
});
