package com.provamappa.globe

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

/** Una voce dell'elenco o della ricerca. */
data class Voce(
    val tipo: String,     // "countries" | "places"
    val codice: String,   // ISO3 per le nazioni, "g:<geonameid>" per le citta'
    val nome: String,
    val sotto: String,    // riga di contesto
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    /**
     * Il codice a due lettere del paese: per una nazione il **suo**, per una
     * citta' quello del paese che la contiene.
     *
     * Serve perche' le citta' sono indicizzate per ISO2 mentre la chiave di una
     * nazione e' l'ISO3, e perche' l'elenco di cio' che si e' marcato si filtra
     * per nazione — e la chiave di una citta', `g:<geonameid>`, non dice dove
     * sia. Lo valorizzano [IndiceCitta.nazioni], [IndiceCitta.cerca] e
     * [IndiceCitta.cittaPerId]; altrove resta vuoto perche' non servirebbe.
     */
    val iso2: String = "",
)

/**
 * Indice di citta' e nazioni: elenchi e ricerca (§9.3, §9.4, §9.5 del piano).
 *
 * Perche' esiste un database separato: **i tile non si possono interrogare**.
 * Portano solo cio' che e' inquadrato, quindi ne' l'elenco delle citta' di una
 * nazione ne' la ricerca possono uscire da li'.
 *
 * E' di **sola lettura** e non contiene stati dell'utente: quelli restano dove
 * sono. Confondere le due cose farebbe di un file rigenerabile dalla pipeline
 * il custode di dati che non si possono rigenerare.
 */
class IndiceCitta(context: Context) {

    private val db: SQLiteDatabase?

    /** Il motivo per cui l'indice non si e' aperto, se non si e' aperto. */
    private var errore: String = "motivo sconosciuto"

    init {
        db = try {
            val f = copiaSeServe(context)
            val aperto = SQLiteDatabase.openDatabase(f.path, null, SQLiteDatabase.OPEN_READONLY)
            // una lettura di prova: un file troncato o corrotto si apre lo
            // stesso, e il difetto salterebbe fuori solo alla prima ricerca
            aperto.rawQuery("SELECT count(*) FROM nazione", null).use { c ->
                c.moveToFirst()
                Log.i(TAG, "indice pronto: ${c.getInt(0)} nazioni, ${f.length() / 1048576} MB")
            }
            aperto
        } catch (e: Exception) {
            Log.e(TAG, "indice non apribile: elenchi e ricerca resteranno vuoti", e)
            errore = "${e.javaClass.simpleName}: ${e.message}"
            null
        }
    }

    /**
     * SQLite ha bisogno di un file vero: non sa leggere da dentro l'APK, a
     * differenza dei PMTiles che invece si leggono in posto (§4.2). Quindi al
     * primo avvio l'indice si copia fuori una volta sola.
     *
     * Il confronto e' sulla dimensione **e sugli ultimi byte**, non su una
     * versione scritta a mano: ricordarsi di alzare un numero e' esattamente il
     * genere di cosa che ci si dimentica.
     *
     * Gli ultimi byte servono perche' la sola dimensione non basta. SQLite alloca
     * a pagine da 4 KB: rigenerando l'indice con sette nazioni in piu' e le stesse
     * 440.273 citta', il file puo' venire **identico nella lunghezza** e diverso
     * nel contenuto. In quel caso la copia vecchia restava, e l'app cercava in un
     * database di due settimane prima senza che niente lo dicesse. Leggere la
     * coda dei due file costa qualche microsecondo e toglie di mezzo il dubbio.
     */
    private fun copiaSeServe(context: Context): File {
        val dest = File(context.filesDir, NOME)

        // `available()` e **non** `openFd().length`: openFd funziona solo sugli
        // asset non compressi — e' la strada che usano i PMTiles, dichiarati
        // `noCompress` apposta — mentre il database e' compresso nell'APK, e li'
        // openFd solleva un'eccezione. Costava l'indice intero: la ricerca e
        // l'elenco delle nazioni rispondevano "indice non disponibile".
        val attesa = context.assets.open(NOME).use { it.available().toLong() }
        if (dest.isFile && dest.length() == attesa && codaUguale(context, dest, attesa)) return dest

        Log.i(TAG, "copio l'indice dagli asset (${attesa / 1048576} MB)")
        val t0 = System.currentTimeMillis()
        context.assets.open(NOME).use { input ->
            dest.outputStream().use { output -> input.copyTo(output, 1 shl 20) }
        }
        Log.i(TAG, "indice pronto in ${System.currentTimeMillis() - t0} ms")
        return dest
    }

    /** Gli ultimi [CODA] byte dell'asset e della copia coincidono? */
    private fun codaUguale(context: Context, dest: File, dimensione: Long): Boolean = try {
        val daAsset = ByteArray(CODA)
        context.assets.open(NOME).use { input ->
            input.skip(dimensione - CODA)
            var letti = 0
            while (letti < CODA) {
                val n = input.read(daAsset, letti, CODA - letti)
                if (n < 0) break
                letti += n
            }
        }
        val daDisco = ByteArray(CODA)
        java.io.RandomAccessFile(dest, "r").use { raf ->
            raf.seek(dimensione - CODA)
            raf.readFully(daDisco)
        }
        daAsset.contentEquals(daDisco)
    } catch (e: Exception) {
        Log.w(TAG, "confronto della coda non riuscito, ricopio", e)
        false
    }

    val disponibile: Boolean get() = db != null

    /**
     * Cosa e' successo all'indice, in una riga da mostrare all'utente.
     *
     * Esiste perche' i guasti di questo pezzo sono **muti**: `interroga` cattura
     * le eccezioni e restituisce una lista vuota, e una lista vuota a schermo e'
     * indistinguibile da "non ho trovato niente". Senza un cavo USB e senza
     * logcat non c'era modo di sapere se il database non si fosse aperto, si
     * fosse aperto vuoto, o funzionasse benissimo e il difetto stesse altrove.
     *
     * I numeri sono contati adesso, non scritti a mano: e' tutto il punto.
     */
    fun diagnostica(): String {
        val d = db ?: return "indice non aperto — $errore"
        return try {
            fun conta(tabella: String) =
                d.rawQuery("SELECT count(*) FROM $tabella", null).use { c ->
                    c.moveToFirst(); c.getInt(0)
                }
            val n = conta("nazione")
            val c = conta("citta")
            val f = conta("citta_fts")
            "%,d nazioni · %,d città · %,d nell'indice di ricerca".format(n, c, f)
        } catch (e: Exception) {
            "database aperto ma illeggibile: ${e.javaClass.simpleName} — ${e.message}"
        }
    }


    /** Tutte le nazioni, in ordine alfabetico italiano. */
    fun nazioni(): List<Voce> = interroga(
        "SELECT codice, nome, citta, iso2 FROM nazione ORDER BY nome",
    ) { c ->
        val n = c.getInt(2)
        Voce(
            tipo = "countries",
            codice = c.getString(0),
            nome = c.getString(1),
            sotto = if (n > 0) "%,d città".format(n) else "nessuna città nell'indice",
            iso2 = c.getString(3) ?: "",
        )
    }

    /**
     * Citta' di una nazione, **per popolazione decrescente** (§9.3).
     *
     * Non in ordine alfabetico: il Messico ne ha 118.418, e alfabeticamente le
     * citta' che uno cerca sarebbero sepolte. A blocchi, perche' l'elenco non
     * si carica tutto in memoria.
     */
    fun cittaDi(iso2: String, offset: Int, quante: Int): List<Voce> = interroga(
        "SELECT id, nome, pop, lat, lon FROM citta WHERE paese = ? ORDER BY pop DESC, nome LIMIT ? OFFSET ?",
        iso2, quante.toString(), offset.toString(),
    ) { c -> voceCitta(c) }

    /** Ricerca per nome su citta' e nazioni. */
    fun cerca(testo: String, quante: Int = 40): List<Voce> {
        val q = testo.trim()
        if (q.length < 2) return emptyList()

        // `iso2` serve: senza, aprendo una nazione trovata con la ricerca
        // l'elenco delle sue citta' interrogava con un codice vuoto e restava
        // vuoto — mentre dall'elenco iniziale, che l'iso2 ce l'ha, funzionava.
        val nazioni = interroga(
            "SELECT codice, nome, citta, iso2 FROM nazione WHERE nome LIKE ? OR nome_ascii LIKE ? ORDER BY nome LIMIT 8",
            "%$q%", "%$q%",
        ) { c ->
            Voce(
                tipo = "countries",
                codice = c.getString(0),
                nome = c.getString(1),
                sotto = "nazione · %,d città".format(c.getInt(2)),
                iso2 = c.getString(3) ?: "",
            )
        }

        // Sintassi FTS4: `parola*` cerca per prefisso, cosi' "mila" trova Milano
        // gia' mentre si digita. Si ripulisce il testo da tutto cio' che per FTS
        // e' sintassi — virgolette, asterischi, parentesi, trattini — perche'
        // altrimenti la query fallisce e la ricerca sembra non trovare nulla.
        val parole = q.replace(Regex("[^\\p{L}\\p{N} ]"), " ").trim().split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
        if (parole.isEmpty()) return nazioni
        val termine = parole.joinToString(" ") + "*"

        val citta = interroga(
            """SELECT c.id, c.nome, c.pop, c.lat, c.lon
               FROM citta_fts f JOIN citta c ON c.rowid = f.rowid
               WHERE citta_fts MATCH ? ORDER BY c.pop DESC LIMIT ?""",
            termine, quante.toString(),
        ) { c -> voceCitta(c) }

        return nazioni + citta
    }

    /**
     * Le citta' con questi identificativi, per gli elenchi di cio' che l'utente
     * ha marcato: li' si parte dalle chiavi salvate — `g:<geonameid>` — e
     * mancano i nomi, che stanno solo qui.
     *
     * A blocchi di 900 perche' SQLite si ferma a 999 parametri per istruzione, e
     * chi ha segnato mille citta' e' esattamente la persona che apre l'elenco.
     */
    fun cittaPerId(ids: List<Long>): List<Voce> {
        if (ids.isEmpty()) return emptyList()
        val out = ArrayList<Voce>(ids.size)
        for (blocco in ids.chunked(900)) {
            val segnaposto = blocco.joinToString(",") { "?" }
            out += interroga(
                // `paese` in piu' rispetto alle altre letture di citta': l'elenco
                // del marcato si filtra per nazione, e la chiave salvata —
                // `g:<geonameid>` — non dice in che paese si trovi la citta'.
                "SELECT id, nome, pop, lat, lon, paese FROM citta WHERE id IN ($segnaposto)",
                *blocco.map { it.toString() }.toTypedArray(),
            ) { c -> voceCitta(c).copy(iso2 = c.getString(5) ?: "") }
        }
        return out
    }

    private fun voceCitta(c: android.database.Cursor): Voce {
        val pop = c.getInt(2)
        return Voce(
            tipo = "places",
            codice = "g:${c.getLong(0)}",   // stessa chiave che usa la mappa
            nome = c.getString(1),
            sotto = if (pop > 0) "%,d abitanti".format(pop) else "",
            lat = c.getDouble(3),
            lon = c.getDouble(4),
        )
    }

    private fun <T> interroga(
        sql: String,
        vararg args: String,
        leggi: (android.database.Cursor) -> T,
    ): List<T> {
        val d = db ?: return emptyList()
        return try {
            d.rawQuery(sql, args).use { c ->
                val out = ArrayList<T>(c.count.coerceAtMost(256))
                while (c.moveToNext()) out.add(leggi(c))
                out
            }
        } catch (e: Exception) {
            Log.e(TAG, "query fallita: $sql", e)
            emptyList()
        }
    }

    companion object {
        const val TAG = "IndiceCitta"
        const val NOME = "citta.db"

        /** Quanti byte di coda confrontare per decidere se la copia e' quella giusta. */
        const val CODA = 4096
    }
}
