pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ProvaMappa"
include(":app")

// I dati geografici: un asset pack, non un modulo di codice. Vedi dati/build.gradle.kts.
include(":dati")
