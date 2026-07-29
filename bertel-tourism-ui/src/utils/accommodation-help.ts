/**
 * Microcopies validées pour les familles et natures d'hébergement.
 *
 * Elles sont volontairement séparées de `ref_code.description` : ce dernier
 * contient aussi l'historique d'import et des notes d'arbitrage utiles aux
 * audits, mais impropres à l'interface agent. Les clés restent les vrais codes
 * métier afin que création et Explorer présentent exactement la même aide.
 */

const FAMILY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  hotellerie:
    'Établissements proposant des chambres à la nuitée avec des services hôteliers, comme la réception et le ménage.',
  locatif:
    "Logements autonomes loués au voyageur et chambres d'hôtes chez l'habitant.",
  collectif:
    "Hébergements accueillant des groupes ou organisés en résidence : auberge, gîte collectif, refuge, résidence ou village de vacances.",
  campings_terrains:
    "Terrains organisés pour le camping ou les hébergements légers : camping, aire naturelle, terrain déclaré et parc résidentiel de loisirs.",
  aires_haltes_plein_air:
    "Lieux autorisant une halte ou une nuitée de plein air sans constituer un terrain de camping.",
};

const NATURE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'taxonomy_hot:hotel':
    'Établissement proposant des chambres à la nuitée avec des services hôteliers.',
  'taxonomy_hlo:chambre_d_hotes':
    "Chambre meublée chez l'habitant, avec accueil et petit-déjeuner.",
  'taxonomy_hlo:location_saisonniere':
    'Logement meublé autonome loué pour un séjour de courte durée.',
  'taxonomy_hlo:auberge_collective':
    'Hébergement proposant des espaces collectifs et des lits en chambres partagées ou individuelles.',
  'taxonomy_hlo:gite_de_groupe':
    "Hébergement destiné à l'accueil d'un groupe. Ici, « Gîte » ne désigne pas le nom commercial d'un meublé de tourisme.",
  'taxonomy_hlo:gite_de_randonnee':
    "Hébergement collectif situé sur un itinéraire et destiné notamment aux voyageurs faisant étape.",
  'taxonomy_rva:tourism_residence':
    'Ensemble de logements autonomes exploités par un même gestionnaire avec des services collectifs.',
  'taxonomy_rva:holiday_village':
    "Ensemble d'hébergements de vacances proposant des équipements ou services communs.",
  'taxonomy_rva:aparthotel':
    'Résidence composée de logements autonomes proposant des services proches de ceux d’un hôtel.',
  'taxonomy_camp:camping':
    "Terrain aménagé pour l'accueil de tentes, caravanes, camping-cars ou résidences mobiles. Le classement en étoiles se renseigne séparément.",
  'taxonomy_hpa:natural_camp_area':
    "Catégorie réglementaire de terrain de camping aménagé, classée sans étoile. Elle accueille uniquement tentes, caravanes et camping-cars, pendant six mois maximum par an ; mobil-homes et habitations légères y sont interdits.",
  'taxonomy_hpa:declared_campground':
    "Petit terrain accueillant des campeurs sous le régime déclaratif, sans être présenté comme un camping classé. Précisez ensuite s'il est à la ferme ou chez l'habitant.",
  'taxonomy_hpa:farm_camping':
    "Terrain de camping déclaré situé sur une exploitation agricole en activité.",
  'taxonomy_hpa:homestay_camping':
    "Terrain de camping déclaré proposé chez un particulier, hors exploitation agricole.",
  'taxonomy_hpa:residential_leisure_park':
    "Terrain aménagé principalement autour d'habitations légères, chalets ou mobil-homes, avec des équipements communs et sans résidence principale.",
  'taxonomy_hpa:bivouac_area':
    "Lieu identifié où une installation légère et temporaire pour la nuit est autorisée, selon la réglementation locale.",
  'taxonomy_hpa:motorhome_area':
    "Aire autorisant explicitement le stationnement et la nuitée des camping-cars. Eau, vidange et électricité sont des services séparés.",
  'taxonomy_hpa:motorhome_night_stop':
    "Lieu autorisant une halte nocturne courte pour camping-car ou van, sans présumer de la présence de services.",
};

export function accommodationFamilyDescription(code: string): string | null {
  return FAMILY_DESCRIPTIONS[code] ?? null;
}

export function accommodationNatureDescription(domain: string, code: string): string | null {
  return NATURE_DESCRIPTIONS[`${domain}:${code}`] ?? null;
}
