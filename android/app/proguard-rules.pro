#
# Regole per R8, che nella build di release toglie il codice non raggiungibile
# e rinomina il resto.
#
# Il problema di quest'app in una riga: **meta' delle chiamate arrivano da
# JavaScript**, e R8 legge solo Kotlin. Un metodo invocato unicamente dalla
# pagina, per R8, non e' invocato da nessuno.
#

# Il ponte con la WebView: TileFiles (i PMTiles letti a pezzi) e PonteUi (la
# selezione, lo stato utente, l'immagine catturata, la lingua). Senza questa
# regola R8 li toglie o li rinomina, e la chiamata dalla pagina fallisce a
# silenzio: nessuna eccezione in Kotlin, solo una mappa che non si riempie o
# nomi di paesi che restano nella lingua sbagliata.
#
# `keepclasseswithmembers` tiene la classe **e** il nome originale dei metodi
# annotati. Le regole predefinite di Android ne contengono gia' una uguale:
# questa e' qui perche' sia una decisione scritta e non un effetto collaterale
# di un file che potrebbe cambiare.
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Le classi del ponte per nome, cosi' l'elenco e' leggibile anche a chi non
# conosce la regola qui sopra.
-keep class com.provamappa.globe.TileFiles { *; }
-keep class com.provamappa.globe.PonteUi { *; }

# I nomi dei file e le righe negli stack trace delle segnalazioni: senza questo
# un crash riportato da Play e' una sequenza di lettere senza posizione.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
