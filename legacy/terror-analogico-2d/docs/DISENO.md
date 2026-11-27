# Terror Analógico — Documento de diseño

## Idea

Una estación de televisión rural de 1994 transmite una señal que no debería existir. Un técnico (o tú, sin saber bien por qué estás ahí) recupera tres cintas de VHS del archivo y las reproduce en el VCR de la sala de control para entender qué está pasando. Cuando termines, la puerta del transmisor se abre y tienes que decidir si subir.

**Género:** terror analógico (*analog horror*), found footage, supervivencia ligera.
**Plataforma:** navegador (escritorio), teclado y ratón.
**Vista:** cenital con linterna. La oscuridad hace el trabajo.

## Pilares

1. **Lo que no ves da más miedo.** Todo está en penumbra; la linterna es tu única herramienta.
2. **Mirar es arriesgado.** Iluminar a la Señal la congela, pero la estática crece.
3. **La estética es parte del juego.** Timestamp REC, barra de señal, estática, tracking y textos de cinta.

## Historia (fragmentos de las cintas)

Las cintas están en `src/content.js`. Resumen de lo que revelan:

- **Cinta 01 (Día 1):** un técnico llega sin que nadie lo llame; dice que la señal está ensayando.
- **Cinta 02 (Día 4):** la estática sigue un segundo después de apagar el televisor; alguien respira del otro lado.
- **Cinta 03 (Día 9):** la cinta que tienes no es la original; el transmisor ya salió al aire y busca tu cara.

El final actual es breve: llegar a la salida abierta gana la partida con el texto "Subiste al transmisor". Se puede ampliar.

## Mecánicas

### Linterna
- Apuntas con el ratón. El cono tiene alcance `FLASHLIGHT_RANGE` y ancho `FLASHLIGHT_FOV`.
- Alrededor del jugador hay una luz tenue (`AMBIENT_RADIUS`) para no estar completamente a ciegas.

### La Señal (entidad)
- Empieza en la sala del sótano (`E` en el mapa).
- **Se mueve solo cuando no está en el cono de la linterna.** Si la iluminas, se congela.
- Se mueve por el camino más corto hacia ti (BFS en `src/pathfind.js`), recalculado cada `REPATH_INTERVAL` segundos.
- Si te toca (`ENTITY_TOUCH_DIST`), pierdes.

### Señal (barra)
- Va de 1 (clara) a 0 (perdida, pierdes).
- Cae cuando estás a menos de `SENSE_RANGE` de la Señal, y cae un poco más mientras la miras.
- Se recupera lentamente cuando estás lejos y no la miras.
- La estática visual y el volumen del siseo siguen a `1 − señal`.

### Cintas y VCR
- Pasar sobre una cinta la recoge automáticamente.
- Con `E` cerca del VCR reproduces la primera cinta que lleves. Dura `TAPE_PLAY_TIME` segundos.
- **Durante la reproducción no puedes moverte, pero la Señal sigue avanzando.** No se puede empezar a reproducir si está a menos de `SENSE_RANGE`.
- Al reproducir las tres, se abre la salida (`X`).

### Salida
- Sólida hasta que se abren las tres cintas. Entrar en ella gana la partida.

## Valores de ajuste

Todos en `src/config.js`. Puntos de partida:

| Constante | Valor | Qué controla |
| --- | --- | --- |
| `PLAYER_SPEED` | 96 px/s | Velocidad del jugador |
| `ENTITY_SPEED` | 62 px/s | Velocidad de la Señal (más lenta que el jugador) |
| `FLASHLIGHT_RANGE` | 220 px | Alcance de la linterna |
| `SENSE_RANGE` | 5 casillas | Distancia a la que la señal empieza a caer |
| `SIGNAL_DRAIN` | 0.10/s | Caída de señal cerca de la Señal |
| `SIGNAL_LOOK_DRAIN` | 0.04/s | Caída extra por mirarla |
| `SIGNAL_RECOVER` | 0.05/s | Recuperación lejos de ella |
| `TAPE_PLAY_TIME` | 4 s | Duración de cada cinta |

Si el juego resulta demasiado fácil o difícil, lo primero que ajustaría es la relación entre `ENTITY_SPEED` y `PLAYER_SPEED`, y `SIGNAL_DRAIN`.

## Mapa

El mapa está en `MAP_ROWS` (`src/world.js`), 30×18 casillas:

- **Arriba:** recepción (inicio, VCR), archivo (cinta), control (cinta). Tres puertas hacia el sótano.
- **Medio:** sótano con tres habitaciones y pasillo abierto. Una cinta.
- **Abajo:** sala larga donde aparece la Señal; la salida está en el borde derecho.

## Pendientes

Ordenados por valor aproximado:

1. **Sustos y audio:** sonido de stinger cuando la Señal se acerca; latido de la estática; un susurro al reproducir cintas.
2. **Menú de pausa** con `ESC` y opciones de volumen.
3. **Más contenido:** un segundo piso con otro VCR y más cintas, o un segundo mapa.
4. **Efectos visuales:** aberración cromática al perder señal; parpadeo de la linterna.
5. **Progreso:** guardar cintas reproducidas en `localStorage` entre sesiones.
6. **Controles táctiles** para móvil (hoy el juego requiere teclado).
7. **Final alternativo:** si reproduces las cintas en un orden concreto, o si no subes al transmisor.

## Fuera de alcance (por ahora)

- Multijugador.
- Gráficos en 3D.
- Motor de juego externo (Unity, Godot, etc.); se mantiene todo en JS puro para que sea fácil de leer y modificar.
