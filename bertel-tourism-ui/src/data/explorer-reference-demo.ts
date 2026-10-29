import type { ExplorerReferences, ExplorerReferenceOption } from '../types/domain';

// Representative Réunion municipalities for demo mode city dropdown.
// Live mode derives from api.get_dashboard_filter_options() (object_location corpus).
const DEMO_CITIES = ['Le Tampon', 'Saint-Benoît', 'Saint-Denis', 'Saint-Paul', 'Saint-Pierre', 'Sainte-Marie'];

export function buildDemoReferences(ACCESSIBILITY_DISABILITY_REFERENCES: ExplorerReferenceOption[]): ExplorerReferences {
  return {
    accessibilityDisabilityTypes: ACCESSIBILITY_DISABILITY_REFERENCES,
    rankedLabelSchemes: [
      { code: 'meuble_stars', name: 'Classement meublés', group: 'Classements' },
      // §176 — Gîtes de France = label noté de réseau (épis), groupe « Labels notés ».
      { code: 'gites_epics', name: 'Gîtes de France (épis)', group: 'Labels notés' },
      { code: 'qualite_tourisme_reunion', name: 'Qualité Tourisme Île de La Réunion', group: 'Labels qualité' },
      { code: 'LBL_CLEF_VERTE', name: 'Clef Verte', group: 'Durabilité' },
      { code: 'LBL_TOURISME_HANDICAP', name: 'Tourisme & Handicap', group: 'Accessibilité' },
    ],
    rankedLabelSchemeValues: {
      meuble_stars: [
        { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
        { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
      ],
      gites_epics: [
        { code: '1', name: '1 épi' }, { code: '2', name: '2 épis' }, { code: '3', name: '3 épis' },
        { code: '4', name: '4 épis' }, { code: '5', name: '5 épis' },
      ],
    },
    accessibilityAmenities: [
      { code: 'acc_pmr_parking', name: 'Places PMR', disabilityTypes: ['motor'] },
      { code: 'acc_step_removal', name: 'Acces sans ressaut', disabilityTypes: ['motor'] },
      { code: 'acc_magnetic_loop', name: 'Boucle magnetique', disabilityTypes: ['hearing'] },
      { code: 'acc_subtitles', name: 'Sous-titrage', disabilityTypes: ['hearing'] },
      { code: 'acc_braille_signage', name: 'Signaletique braille', disabilityTypes: ['visual'] },
      { code: 'acc_falc_docs', name: 'Documents en FALC', disabilityTypes: ['cognitive'] },
      { code: 'acc_staff_mental_training', name: 'Personnel forme - sante mentale', disabilityTypes: ['cognitive'] },
    ],
    sustainabilityCategories: [
      {
        code: 'CAT_ENERGY',
        name: 'Energie',
        description: 'Reduction et pilotage des consommations.',
        actions: [
          { code: 'MA_LOW_ENERGY_LIGHTING', name: 'Eclairage basse consommation', categoryCode: 'CAT_ENERGY' },
          { code: 'MA_RENEWABLE_ENERGY', name: 'Energie renouvelable', categoryCode: 'CAT_ENERGY' },
        ],
      },
      {
        code: 'CAT_WASTE',
        name: 'Dechets',
        description: 'Tri, reduction et reemploi.',
        actions: [
          { code: 'MA_SORTING_BINS', name: 'Tri des dechets', categoryCode: 'CAT_WASTE' },
          { code: 'MA_DURABLE_GOODS_REUSE', name: 'Reemploi et reparation', categoryCode: 'CAT_WASTE' },
        ],
      },
      {
        code: 'CAT_MOBILITY',
        name: 'Mobilite',
        description: 'Acces et mobilites durables.',
        actions: [
          { code: 'MA_BIKE_PARKING', name: 'Stationnement velo', categoryCode: 'CAT_MOBILITY' },
          { code: 'MA_EV_CHARGING', name: 'Recharge electrique', categoryCode: 'CAT_MOBILITY' },
        ],
      },
    ],
    cities: DEMO_CITIES,
    lieuDits: [],
    taxonomies: [
      {
        domain: 'taxonomy_hot',
        name: 'Taxonomie HOT',
        objectType: 'HOT',
        nodes: [
          { code: 'hotel', name: 'Hôtel', description: 'Établissement hôtelier.', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'hotellerie', aliases: [], sourceRef: 'Code du tourisme art. D311-4' },
          { code: 'hotel_with_restaurant', name: 'Hôtel-restaurant', parentCode: 'hotel', depth: 1, isAssignable: true, position: 2, axis: 'positionnement', family: 'hotellerie', aliases: [] },
          { code: 'boutique_hotel', name: 'Hôtel boutique', parentCode: 'hotel', depth: 1, isAssignable: true, position: 2, axis: 'positionnement', family: 'hotellerie', aliases: [] },
          { code: 'family_hotel', name: 'Hôtel familial', parentCode: 'hotel', depth: 1, isAssignable: true, position: 3, axis: 'positionnement', family: 'hotellerie', aliases: [] },
          { code: 'business_hotel', name: 'Hôtel d’affaires', parentCode: 'hotel', depth: 1, isAssignable: true, position: 4, axis: 'positionnement', family: 'hotellerie', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_hlo',
        name: 'Taxonomie HLO',
        objectType: 'HLO',
        nodes: [
          { code: 'chambre_d_hotes', name: "Chambre d'hôtes", parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'locatif', aliases: [] },
          { code: 'location_saisonniere', name: 'Meublé de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'locatif', aliases: ['Gîte', 'Location saisonnière'] },
          { code: 'auberge_collective', name: 'Auberge', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'collectif', aliases: ['Auberge collective'] },
          { code: 'gite_de_groupe', name: 'Gîte', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'collectif', aliases: ['Gîte de groupe'] },
          { code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'collectif', aliases: ["Gîte d'étape et de randonnée"] },
        ],
      },
      {
        domain: 'taxonomy_rva',
        name: 'Taxonomie RVA',
        objectType: 'RVA',
        nodes: [
          { code: 'tourism_residence', name: 'Résidence de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'holiday_village', name: 'Village de vacances', parentCode: null, depth: 0, isAssignable: true, position: 5, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'aparthotel', name: 'Résidence hôtelière', parentCode: null, depth: 0, isAssignable: true, position: 6, axis: 'nature', family: 'collectif', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_camp',
        name: 'Taxonomie CAMP',
        objectType: 'CAMP',
        nodes: [
          { code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'campings_terrains', aliases: ['Camping aménagé', 'Camping classé'] },
        ],
      },
      {
        domain: 'taxonomy_hpa',
        name: 'Taxonomie HPA',
        objectType: 'HPA',
        nodes: [
          { code: 'natural_camp_area', name: 'Aire naturelle de camping', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'declared_campground', name: 'Terrain de camping déclaré', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'farm_camping', name: 'Camping à la ferme', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 1, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'homestay_camping', name: "Camping chez l'habitant", parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 2, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'residential_leisure_park', name: 'Parc résidentiel de loisirs', parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'campings_terrains', aliases: ['PRL'] },
          { code: 'bivouac_area', name: 'Aire de bivouac', parentCode: null, depth: 0, isAssignable: true, position: 10, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'motorhome_area', name: "Aire d'accueil camping-car", parentCode: null, depth: 0, isAssignable: true, position: 11, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'motorhome_night_stop', name: 'Halte nocturne camping-car/van', parentCode: null, depth: 0, isAssignable: true, position: 12, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_res',
        name: 'Taxonomie RES',
        objectType: 'RES',
        nodes: [
          { code: 'restaurant', name: 'Restaurant', parentCode: null, depth: 0, isAssignable: true, position: 1 },
          { code: 'table_d_hotes', name: "Table d'hôtes", parentCode: null, depth: 0, isAssignable: true, position: 2 },
          { code: 'pizzeria', name: 'Pizzeria', parentCode: null, depth: 0, isAssignable: true, position: 3 },
          { code: 'snack_bar', name: 'Snack-bar', parentCode: 'restaurant', depth: 1, isAssignable: true, position: 4 },
        ],
      },
    ],
    // §201 — `plein_air` est retirée : elle mélangeait un TERRAIN de camping et
    // une simple autorisation de halte. Les deux familles qui la remplacent
    // portent son libellé en alias, car l'ancien terme les recouvrait toutes les
    // deux : une recherche sur « plein air » doit proposer les deux.
    accommodationFamilies: [
      { code: 'hotellerie', name: 'Hôtellerie', position: 1 },
      { code: 'locatif', name: 'Hébergement locatif', position: 2 },
      { code: 'collectif', name: 'Hébergement collectif', position: 3 },
      { code: 'campings_terrains', name: 'Campings et terrains', position: 4, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
      { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', position: 5, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
    ],
    // Démo : les métriques portent leurs types applicables comme en live, sinon le
    // scoping par sous-type (16o) ne serait pas exerçable dans ce mode.
    hotCapacityMetrics: [
      { code: 'beds', name: 'Lits', objectTypes: ['HOT', 'HLO', 'HPA', 'CAMP', 'RVA'] },
      { code: 'bedrooms', name: 'Chambres', objectTypes: ['HOT', 'HLO', 'RVA'] },
      { code: 'pitches', name: 'Emplacements', objectTypes: ['CAMP', 'HPA'] },
    ],
    resCapacityMetrics: [
      { code: 'seats', name: 'Places assises', objectTypes: ['RES'] },
      { code: 'standing_places', name: 'Places debout', objectTypes: ['RES'] },
    ],
    capacityBounds: {
      beds: { HOT: { min: 4, max: 120, sampleSize: 6 }, HLO: { min: 2, max: 14, sampleSize: 22 } },
      bedrooms: { HOT: { min: 2, max: 60, sampleSize: 6 } },
      seats: { RES: { min: 12, max: 180, sampleSize: 14 } },
    },
    itiPractices: [
      { code: 'randonnee', name: 'Randonnee' },
      { code: 'velo', name: 'Velo' },
      { code: 'patrimoine', name: 'Patrimoine' },
    ],
    environmentTags: [
      { code: 'bord_mer', name: 'Bord de mer' },
      { code: 'montagne', name: 'Montagne' },
      { code: 'volcan', name: 'Au pied du volcan' },
      { code: 'foret', name: 'Forêt' },
      { code: 'vue_panoramique', name: 'Vue panoramique' },
    ],
    // §201 — types d'unité d'hébergement (axe multi-valué).
    accommodationUnitTypes: [
      { code: 'house_villa', name: 'Maison / villa' },
      { code: 'apartment', name: 'Appartement' },
      { code: 'studio', name: 'Studio' },
      { code: 'room', name: 'Chambre' },
      { code: 'bungalow', name: 'Bungalow' },
      { code: 'chalet', name: 'Chalet' },
      { code: 'mobile_home', name: 'Mobil-home' },
      { code: 'caravan', name: 'Roulotte' },
      { code: 'dormitory', name: 'Dortoir' },
      { code: 'bare_pitch', name: 'Emplacement nu' },
      { code: 'equipped_pitch', name: 'Emplacement équipé' },
      { code: 'bubble', name: 'Bulle' },
      { code: 'cabin', name: 'Cabane' },
      { code: 'lodge', name: 'Lodge' },
      { code: 'tipi', name: 'Tipi' },
      { code: 'yurt', name: 'Yourte' },
      { code: 'furnished_tent', name: 'Tente aménagée' },
      { code: 'dome', name: 'Dôme' },
      { code: 'tiny_house', name: 'Tiny house' },
      { code: 'boat', name: 'Péniche / bateau' },
      { code: 'unusual_outdoor_unit', name: 'Insolite' },
      { code: 'other', name: 'Autre' },
    ],
    accommodationPositionings: [
      { code: 'hotel_with_restaurant', name: 'Hôtel-restaurant' },
      { code: 'boutique_hotel', name: 'Hôtel boutique' },
      { code: 'business_hotel', name: 'Hôtel d’affaires' },
      { code: 'eco_hotel', name: 'Hôtel écologique' },
      { code: 'family_hotel', name: 'Hôtel familial' },
      { code: 'heritage_hotel', name: 'Hôtel patrimonial' },
      { code: 'modern_hotel', name: 'Hôtel contemporain' },
      { code: 'romantic_hotel', name: 'Hôtel romantique' },
      { code: 'traditional_hotel', name: 'Hôtel traditionnel' },
    ],
    amenityFamilies: [
      { code: 'outdoor', name: 'Plein air' },
      { code: 'wellness', name: 'Bien-être' },
      { code: 'parking', name: 'Parking' },
      { code: 'gastronomy', name: 'Gastronomie' },
    ],
    tags: [
      { slug: 'spa', name: 'Spa', color: '#176b6a' },
      { slug: 'famille', name: 'Famille', color: '#8a5b12' },
      { slug: 'vue-mer', name: 'Vue mer', color: '#1c4d8f' },
    ],
  };
}
