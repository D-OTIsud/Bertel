import { getMarkerImageId } from '../../config/map-markers';
import type { ObjectCard } from '../../types/domain';

export interface MapFeatureProperties {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  price: string;
  rating: string;
  markerIcon: string;
}

export interface MapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: MapFeatureProperties;
}

export interface MapFeatureCollection {
  type: 'FeatureCollection';
  features: MapFeature[];
}

export function buildObjectFeatureCollection(objects: ObjectCard[]): MapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((item) => {
      const lat = item.location?.lat;
      const lon = item.location?.lon;

      if (lat == null || lon == null) {
        return [];
      }

      return [{
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [lon, lat] as [number, number],
        },
        properties: {
          id: item.id,
          name: item.name,
          type: item.type,
          address: item.location?.address ?? 'Sans adresse',
          city: item.location?.city ?? '',
          price: item.render?.price ?? (item.min_price != null ? `${item.min_price} EUR` : ''),
          rating: item.rating == null ? '' : String(item.rating),
          markerIcon: getMarkerImageId(item.type),
        },
      }];
    }),
  };
}
