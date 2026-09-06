package com.provamappa.globe

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Una riga di elenco, con i tre stati **diretti** e non a ciclo.
 *
 * Un tocco solo per marcare, come nella scheda della mappa: il ciclo obbligava a
 * passare per stati che non si volevano e rendeva impossibile toccare una voce
 * senza modificarla.
 *
 * Sta in un file suo perche' la usano tre schermate — l'indice generale, la
 * ricerca dentro una nazione e l'elenco di cio' che si e' marcato — e una riga
 * che si comporta in modo diverso a seconda di dove la si guarda sarebbe un
 * difetto, non una variante.
 */
@Composable
internal fun RigaVoce(
    voce: Voce,
    stato: Stato,
    onImposta: (Stato) -> Unit,
    onApri: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onApri).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(voce.nome, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (voce.sotto.isNotEmpty()) {
                Text(
                    voce.sotto,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (s in Stato.entries) {
                val scelto = s == stato
                Box(
                    Modifier
                        .size(if (scelto) 26.dp else 20.dp)
                        .clip(CircleShape)
                        .background(if (scelto) s.colore else s.colore.copy(alpha = 0.18f))
                        .clickable { onImposta(s) },
                )
            }
        }
    }
}
