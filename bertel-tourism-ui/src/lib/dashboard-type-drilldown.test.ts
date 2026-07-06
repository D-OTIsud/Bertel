import { useDashboardExplorerStore } from '../store/explorer-store';
import { bucketForBackendType, activeDrilldownTypes, toggleDrilldownType } from './dashboard-type-drilldown';

const store = useDashboardExplorerStore;
beforeEach(() => store.getState().resetAll());

it('bucketForBackendType mappe un type sur sa famille', () => {
  expect(bucketForBackendType('HLO')).toBe('HOT');
  expect(bucketForBackendType('RES')).toBe('RES');
});

it('depuis un état vierge, cliquer un sous-type HOT sélectionne la famille et restreint à ce type', () => {
  toggleDrilldownType(store, 'HLO');
  expect(store.getState().selectedBuckets).toContain('HOT');
  expect(activeDrilldownTypes(store.getState())).toEqual(['HLO']);
});

it('re-cliquer le dernier type actif désélectionne la famille', () => {
  toggleDrilldownType(store, 'HLO');
  toggleDrilldownType(store, 'HLO');
  expect(store.getState().selectedBuckets).not.toContain('HOT');
  expect(activeDrilldownTypes(store.getState())).toEqual([]);
});

it('un bucket sans sous-type (RES) fait un toggle de famille', () => {
  toggleDrilldownType(store, 'RES');
  expect(store.getState().selectedBuckets).toContain('RES');
  toggleDrilldownType(store, 'RES');
  expect(store.getState().selectedBuckets).not.toContain('RES');
});
