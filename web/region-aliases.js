/*
 * Compatibilita' fra i GID GADM usati fino alla versione 1 e i codici
 * `ISO3.slug` introdotti con geoBoundaries.
 *
 * La tabella copre per intero i sei paesi presenti nel backup verificato del
 * 2026-09-06, non soltanto le regioni marcate: cosi' non codifica le scelte
 * personali dell'utente. Malta non ha una nuova suddivisione equivalente; i
 * suoi cinque vecchi codici sono scarti espliciti, gia' accettati nel piano.
 */

export const ALIAS_REGIONI = {
  'ITA.1_1': 'ITA.abruzzo',
  'ITA.2_1': 'ITA.puglia',
  'ITA.3_1': 'ITA.basilicata',
  'ITA.4_1': 'ITA.calabria',
  'ITA.5_1': 'ITA.campania',
  'ITA.6_1': 'ITA.emilia-romagna',
  'ITA.7_1': 'ITA.friuli-venezia-giulia',
  'ITA.8_1': 'ITA.lazio',
  'ITA.9_1': 'ITA.liguria',
  'ITA.10_1': 'ITA.lombardia',
  'ITA.11_1': 'ITA.marche',
  'ITA.12_1': 'ITA.molise',
  'ITA.13_1': 'ITA.piemonte',
  'ITA.14_1': 'ITA.sardegna',
  'ITA.15_1': 'ITA.sicilia',
  'ITA.16_1': 'ITA.toscana',
  'ITA.17_1': 'ITA.trentino-alto-adige',
  'ITA.18_1': 'ITA.umbria',
  'ITA.19_1': 'ITA.valle-d-aosta',
  'ITA.20_1': 'ITA.veneto',

  'FRA.1_1': 'FRA.auvergne-rhone-alpes',
  'FRA.2_1': 'FRA.bourgogne-franche-comte',
  'FRA.3_1': 'FRA.bretagne',
  'FRA.4_1': 'FRA.centre-val-de-loire',
  'FRA.5_1': 'FRA.corse',
  'FRA.6_1': 'FRA.grand-est',
  'FRA.7_1': 'FRA.hauts-de-france',
  'FRA.8_1': 'FRA.ile-de-france',
  'FRA.9_1': 'FRA.normandie',
  'FRA.10_1': 'FRA.nouvelle-aquitaine',
  'FRA.11_1': 'FRA.occitanie',
  'FRA.12_1': 'FRA.pays-de-la-loire',
  'FRA.13_1': 'FRA.provence-alpes-cote-d-azur',

  'DEU.1_1': 'DEU.baden-wurttemberg',
  'DEU.2_1': 'DEU.bayern',
  'DEU.3_1': 'DEU.berlin',
  'DEU.4_1': 'DEU.brandenburg',
  'DEU.5_1': 'DEU.bremen',
  'DEU.6_1': 'DEU.hamburg',
  'DEU.7_1': 'DEU.hessen',
  'DEU.8_1': 'DEU.mecklenburg-vorpommern',
  'DEU.9_1': 'DEU.niedersachsen',
  'DEU.10_1': 'DEU.nordrhein-westfalen',
  'DEU.11_1': 'DEU.rheinland-pfalz',
  'DEU.12_1': 'DEU.saarland',
  'DEU.13_1': 'DEU.sachsen-anhalt',
  'DEU.14_1': 'DEU.sachsen',
  'DEU.15_1': 'DEU.schleswig-holstein',
  'DEU.16_1': 'DEU.thuringen',

  'ESP.1_1': 'ESP.andalucia',
  'ESP.2_1': 'ESP.aragon',
  'ESP.3_1': 'ESP.cantabria',
  'ESP.4_1': 'ESP.castilla-la-mancha',
  'ESP.5_1': 'ESP.castilla-y-leon',
  'ESP.6_1': 'ESP.cataluna-catalunya',
  'ESP.7_1': ['ESP.ciudad-autonoma-de-ceuta', 'ESP.ciudad-autonoma-de-melilla'],
  'ESP.8_1': 'ESP.comunidad-de-madrid',
  'ESP.9_1': 'ESP.comunidad-foral-de-navarra',
  'ESP.10_1': 'ESP.comunitat-valenciana',
  'ESP.11_1': 'ESP.extremadura',
  'ESP.12_1': 'ESP.galicia',
  'ESP.13_1': 'ESP.illes-balears',
  'ESP.14_1': 'ESP.canarias',
  'ESP.15_1': 'ESP.la-rioja',
  'ESP.16_1': 'ESP.pais-vasco-euskadi',
  'ESP.17_1': 'ESP.principado-de-asturias',
  'ESP.18_1': 'ESP.region-de-murcia',

  'NLD.1_1': 'NLD.drenthe',
  'NLD.2_1': 'NLD.flevoland',
  'NLD.3_1': 'NLD.fryslan',
  'NLD.4_1': 'NLD.gelderland',
  'NLD.5_1': 'NLD.groningen',
  'NLD.6_1': null,
  'NLD.7_1': 'NLD.limburg',
  'NLD.8_1': 'NLD.noord-brabant',
  'NLD.9_1': 'NLD.noord-holland',
  'NLD.10_1': 'NLD.overijssel',
  'NLD.11_1': 'NLD.utrecht',
  'NLD.12_1': 'NLD.zeeland',
  'NLD.13_1': null,
  // Il record GADM si chiamava "NA", ma la geometria e' Zuid-Holland.
  'NLD.14_1': 'NLD.zuid-holland',

  'POL.1_1': 'POL.lower-silesian-voivodeship',
  'POL.2_1': 'POL.kuyavian-pomeranian-voivodeship',
  'POL.3_1': 'POL.lodz-voivodeship',
  'POL.4_1': 'POL.lublin-voivodeship',
  'POL.5_1': 'POL.lubusz-voivodeship',
  'POL.6_1': 'POL.lesser-poland-voivodeship',
  'POL.7_1': 'POL.masovian-voivodeship',
  'POL.8_1': 'POL.opole-voivodeship',
  'POL.9_1': 'POL.subcarpathian-voivodeship',
  'POL.10_1': 'POL.podlaskie-voivodeship',
  'POL.11_1': 'POL.pomeranian-voivodeship',
  'POL.12_1': 'POL.silesian-voivodeship',
  'POL.13_1': 'POL.swietokrzyskie-voivodeship',
  'POL.14_1': 'POL.warmian-masurian-voivodeship',
  'POL.15_1': 'POL.greater-poland-voivodeship',
  'POL.16_1': 'POL.west-pomeranian-voivodeship',

  'MLT.1_1': null,
  'MLT.2_1': null,
  'MLT.3_1': null,
  'MLT.4_1': null,
  'MLT.5_1': null,

  // Maldive passate da geoBoundaries a Natural Earth: i nomi italiani di NE
  // portano il prefisso "Atollo", quindi cambia lo slug di venti codici su
  // ventuno (Male' resta). Addu si chiama Seenu nella nomenclatura di NE.
  'MDV.addu': 'MDV.atollo-seenu',
  'MDV.alif-alif': 'MDV.atollo-alif-alif',
  'MDV.alif-dhaalu': 'MDV.atollo-alif-dhaal',
  'MDV.baa': 'MDV.atollo-baa',
  'MDV.dhaalu': 'MDV.atollo-dhaalu',
  'MDV.faafu': 'MDV.atollo-faafu',
  'MDV.gaafu-alif': 'MDV.atollo-gaafu-alif',
  'MDV.gaafu-dhaalu': 'MDV.atollo-gaafu-dhaalu',
  'MDV.gnaviyani': 'MDV.atollo-gnaviyani',
  'MDV.haa-alif': 'MDV.atollo-haa-alif',
  'MDV.haa-dhaalu': 'MDV.atollo-haa-dhaalu',
  'MDV.kaafu': 'MDV.atollo-kaafu',
  'MDV.laamu': 'MDV.atollo-laamu',
  'MDV.lhaviyani': 'MDV.atollo-lhaviyani',
  'MDV.meemu': 'MDV.atollo-meemu',
  'MDV.noonu': 'MDV.atollo-noonu',
  'MDV.raa': 'MDV.atollo-raa',
  'MDV.shaviyani': 'MDV.atollo-shaviyani',
  'MDV.thaa': 'MDV.atollo-thaa',
  'MDV.vaavu': 'MDV.atollo-vaavu',
};

const PESO = { none: 0, wanted: 1, visited: 2 };

export function migraCodiciRegioni(regioni = {}) {
  const convertite = {};
  let rimappate = 0;
  let scartate = 0;
  let sconosciute = 0;

  const assegna = (codice, stato) => {
    if ((PESO[stato] || 0) >= (PESO[convertite[codice]] || 0)) convertite[codice] = stato;
  };

  for (const [vecchio, stato] of Object.entries(regioni)) {
    const destinazione = ALIAS_REGIONI[vecchio];
    if (destinazione === undefined) {
      assegna(vecchio, stato);
      if (/^[A-Z]{3}\.\d+_1$/.test(vecchio)) sconosciute++;
      continue;
    }
    if (destinazione === null) {
      scartate++;
      continue;
    }
    for (const nuovo of Array.isArray(destinazione) ? destinazione : [destinazione]) {
      assegna(nuovo, stato);
    }
    rimappate++;
  }
  return { regioni: convertite, rimappate, scartate, sconosciute };
}
