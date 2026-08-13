plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    // Da Kotlin 2.0 il compilatore di Compose e' un plugin a se', con la
    // stessa versione di Kotlin: non si sceglie piu' a mano come prima.
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
