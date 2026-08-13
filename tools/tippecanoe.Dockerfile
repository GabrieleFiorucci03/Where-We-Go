# Tippecanoe compilato da sorgente.
#
# Non esiste una build ufficiale per Windows, e l'immagine pubblicata su ghcr
# richiede autenticazione. Compilarla qui costa qualche minuto una volta sola e
# garantisce una versione recente: quelle vecchie non sanno scrivere PMTiles
# direttamente e obbligherebbero a un passaggio in piu' da MBTiles.
#
# Build:  docker build -f tools/tippecanoe.Dockerfile -t tippecanoe-locale tools
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential ca-certificates git libsqlite3-dev zlib1g-dev \
 && git clone --depth 1 https://github.com/felt/tippecanoe.git /src \
 && make -C /src -j"$(nproc)" \
 && make -C /src install \
 && apt-get purge -y --auto-remove build-essential git \
 && rm -rf /var/lib/apt/lists/* /src

WORKDIR /dati
ENTRYPOINT ["tippecanoe"]
