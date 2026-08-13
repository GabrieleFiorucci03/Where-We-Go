/*
 * Sorgente PMTiles che legge i byte tramite il ponte Kotlin invece che con
 * Range request HTTP.
 *
 * E' il pezzo che lo spike M0-B deve validare: nella WebView Android le Range
 * request su risorse locali non sono affidabili (la prima riesce, le altre
 * falliscono con ERR_FAILED), quindi pmtiles.js viene alimentato da qui.
 *
 * Sul desktop il ponte non esiste e si ricade sulla sorgente HTTP normale, che
 * funziona perche' tools/serve.js implementa le Range correttamente. Cosi' la
 * stessa pagina gira in tutti e due gli ambienti.
 */

/** true quando la pagina gira dentro l'app Android */
export const suAndroid = typeof window !== 'undefined' && !!window.AndroidTiles;

/** Converte la stringa Base64 del ponte in ArrayBuffer. */
function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Implementa l'interfaccia Source di pmtiles.js.
 * Serve solo getKey() e getBytes(offset, length).
 */
export class AndroidBridgeSource {
  /** @param {string} nome nome del file dentro la cartella tiles dell'app */
  constructor(nome) {
    this.nome = nome;
    this.letture = 0;
    this.byteLetti = 0;
    this.errori = 0;
  }

  getKey() {
    return `android://${this.nome}`;
  }

  async getBytes(offset, length) {
    const b64 = window.AndroidTiles.readBase64(this.nome, offset, length);
    if (!b64) {
      this.errori++;
      throw new Error(`lettura fallita: ${this.nome} @${offset}+${length}`);
    }
    const data = base64ToArrayBuffer(b64);
    this.letture++;
    this.byteLetti += data.byteLength;
    return { data };
  }

  statistiche() {
    return { letture: this.letture, byteLetti: this.byteLetti, errori: this.errori };
  }
}

/** Dimensione del file secondo il ponte, o -1. */
export function dimensioneFile(nome) {
  return suAndroid ? window.AndroidTiles.size(nome) : -1;
}

/**
 * Cartella in cui vanno copiati i PMTiles, secondo il ponte.
 * Serve a dire all'utente *dove* mettere i file quando mancano: senza, l'unica
 * traccia sarebbe un errore di rete che non c'entra nulla.
 */
export function cartellaTile() {
  if (!suAndroid || !window.AndroidTiles.cartella) return '';
  try {
    return window.AndroidTiles.cartella();
  } catch (e) {
    return '';
  }
}

/** Elenco dei PMTiles presenti sul dispositivo. */
export function elencoFile() {
  if (!suAndroid) return [];
  try {
    return JSON.parse(window.AndroidTiles.list());
  } catch (e) {
    console.error('elenco PMTiles illeggibile', e);
    return [];
  }
}
