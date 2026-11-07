import { confirmNavigation, registerNavigationGuard } from './navigation-guard';

describe('navigation-guard', () => {
  it('allows navigation when no guard is registered', () => {
    expect(confirmNavigation()).toBe(true);
  });

  it('consults the registered guard', () => {
    const guard = jest.fn(() => false);
    const unregister = registerNavigationGuard(guard);
    expect(confirmNavigation()).toBe(false);
    expect(guard).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('allows navigation again after the guard unregisters', () => {
    const unregister = registerNavigationGuard(() => false);
    unregister();
    expect(confirmNavigation()).toBe(true);
  });

  it('a stale unregister does not clear a guard registered after it', () => {
    const unregisterFirst = registerNavigationGuard(() => false);
    registerNavigationGuard(() => true);
    unregisterFirst();
    expect(confirmNavigation()).toBe(true);
  });
});
