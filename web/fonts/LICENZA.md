# Glifi delle etichette

`Noto Sans Regular/*.pbf` — glifi SDF precompilati, presi dal pacchetto
[openmaptiles/fonts](https://github.com/openmaptiles/fonts) v2.0.

**Font:** Noto Sans, Google. **Licenza:** SIL Open Font License 1.1, che consente
uso, modifica e ridistribuzione anche incorporati in un'applicazione.

## Perché solo queste sei fasce

Sono 526 KB invece dei ~59 MB del pacchetto completo. Bastano perché GeoNames
scrive i nomi in forma romanizzata: misurato sui 450.848 nomi in mappa, 4,7 M di
caratteri ASCII, 135 mila latini accentati, e appena **399 in tutto** fra
cirillico, greco, CJK e arabo.

| fascia | copre |
|---|---|
| `0-255` | latino base e Latin-1 |
| `256-511`, `512-767` | latino esteso A e B |
| `768-1023` | diacritici combinanti, greco, cirillico |
| `7680-7935` | latino esteso addizionale (ḩ, ṯ, ṟ) |
| `8192-8447` | punteggiatura tipografica (apostrofi curvi) |

Restano scoperti una manciata di nomi in CJK e arabo — 15 caratteri in tutto nel
dataset — che compariranno come rettangoli vuoti. Se un giorno dessero fastidio,
si aggiungono le fasce corrispondenti dallo stesso pacchetto: sono grandi, ma
servirebbero solo quelle effettivamente usate.
