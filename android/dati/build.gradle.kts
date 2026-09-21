plugins {
    id("com.android.asset-pack")
}

/*
 * L'asset pack dei dati geografici.
 *
 * Non e' un modulo di codice: un asset pack contiene solo asset, niente classi
 * e niente risorse. Serve a togliere le sagome dal modulo base, che ha un tetto
 * suo — vedi Fase 4 di docs/PUBBLICAZIONE.md.
 *
 * `install-time`: il pacchetto arriva insieme all'app, come split APK, ed e'
 * gia' li' al primo avvio. Si legge con il normale AssetManager, quindi
 * IndiceRegioni e il WebViewAssetLoader non cambiano una riga; l'app non deve
 * gestire stati di scaricamento, ne' il caso «i dati non ci sono ancora».
 * In cambio conta nella dimensione dichiarata sullo Store e chiede il doppio
 * dello spazio libero durante l'installazione.
 *
 * Il nome del pacchetto deve coincidere con il nome della cartella del modulo.
 * Il contenuto di `src/main/assets` non e' versionato: ce lo copia il compito
 * `preparaDati` di app/build.gradle.kts, che e' anche l'unico punto in cui e'
 * scritto che cosa entra qui e che cosa resta nel modulo base.
 */
assetPack {
    packName.set("dati")
    dynamicDelivery {
        deliveryType.set("install-time")
    }
}
