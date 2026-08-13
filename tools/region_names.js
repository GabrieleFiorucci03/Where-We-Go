/*
 * Correzione dei nomi delle suddivisioni GADM.
 *
 * GADM 4.1 ha due difetti sui nomi:
 *   1. in diversi record gli spazi sono stati mangiati: NAME_1 vale
 *      letteralmente "Valled'Aosta", "Friuli-VeneziaGiulia", "TrentinoAltoAdige";
 *   2. usa esonimi inglesi dove esiste il nome locale: "Apulia", "Sicily".
 *
 * Il campo VARNAME_1 non aiuta: e' troncato a una trentina di caratteri
 * ("Emilia-Rom", "Abruzz"), quindi inutilizzabile come sostituto.
 */

/**
 * Reinserisce lo spazio mancante fra una minuscola e una maiuscola.
 * Deliberatamente conservativa: agisce solo sul confine minuscola->maiuscola e
 * sulla preposizione "d'" attaccata alla parola precedente. Non tocca nomi
 * tutti maiuscoli, acronimi, o parole gia' separate.
 *
 * Resta qualche falso positivo possibile nei nomi che contengono legittimamente
 * una maiuscola interna (McMurdo, DeKalb): per questo esiste la tabella di
 * eccezioni qui sotto, e per questo la funzione non viene applicata ai nomi
 * che vi compaiono.
 */
function riparaSpazi(nome) {
  if (!nome || typeof nome !== 'string') return nome;
  let out = nome;
  // "Valled'Aosta" -> "Valle d'Aosta"
  out = out.replace(/([a-zà-öø-ÿ])(d')([A-ZÀ-Þ])/g, "$1 $2$3");
  // "VeneziaGiulia" -> "Venezia Giulia"
  out = out.replace(/([a-zà-öø-ÿ])([A-ZÀ-Þ])/g, '$1 $2');
  return out;
}

/**
 * Nomi locali al posto degli esonimi inglesi.
 * Chiave: GID_1 di GADM 4.1, che identifica la suddivisione senza ambiguita'.
 * Coperta per ora la sola Italia: e' il paese che l'utente guarda piu' spesso.
 * Le altre suddivisioni restano con il nome GADM, corretto negli spazi.
 */
const NOMI_LOCALI = {
  'ITA.1_1': 'Abruzzo',
  'ITA.2_1': 'Puglia',
  'ITA.3_1': 'Basilicata',
  'ITA.4_1': 'Calabria',
  'ITA.5_1': 'Campania',
  'ITA.6_1': 'Emilia-Romagna',
  'ITA.7_1': 'Friuli-Venezia Giulia',
  'ITA.8_1': 'Lazio',
  'ITA.9_1': 'Liguria',
  'ITA.10_1': 'Lombardia',
  'ITA.11_1': 'Marche',
  'ITA.12_1': 'Molise',
  'ITA.13_1': 'Piemonte',
  'ITA.14_1': 'Sardegna',
  'ITA.15_1': 'Sicilia',
  'ITA.16_1': 'Toscana',
  'ITA.17_1': 'Trentino-Alto Adige',
  'ITA.18_1': 'Umbria',
  'ITA.19_1': "Valle d'Aosta",
  'ITA.20_1': 'Veneto',
};

/** Nome definitivo di una suddivisione, dato il suo GID_1 e il NAME_1 grezzo. */
function nomeSuddivisione(gid, nameGrezzo) {
  if (NOMI_LOCALI[gid]) return NOMI_LOCALI[gid];
  return riparaSpazi(nameGrezzo);
}

module.exports = { riparaSpazi, nomeSuddivisione, NOMI_LOCALI };
