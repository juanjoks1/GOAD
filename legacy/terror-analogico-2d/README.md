# Terror Analógico

Un juego de terror en vista cenital con linterna. Estás en una estación de televisión rural en 1994, con un VCR, tres cintas y una señal que no debería seguir al aire.

Estética: VHS, estática, líneas de tracking, timestamp de grabación y ruido de cinta. Terror analógico (*analog horror*) en su forma más pura.

> Estado: prototipo jugable. Un mapa, tres cintas, una entidad, sin menús de pausa ni sonidos de susto todavía.

## Cómo jugar

| Control | Acción |
| --- | --- |
| `W A S D` / flechas | Moverte |
| Ratón | Apuntar la linterna |
| `E` | Reproducir cinta en el VCR (cerca del VCR) |
| `R` / `ENTER` | Reiniciar / empezar |

Recoge las tres cintas, reprodúcelas en el VCR y sube al transmisor.

- La **Señal** se mueve solo cuando **no** la miras con la linterna. Si la iluminas, se congela, pero la estática crece.
- Si te alcanza, pierdes. Si la señal se pierde por completo, también.
- No puedes reproducir una cinta si la Señal está cerca.

## Ejecutar

No hay dependencias ni paso de compilación. Es JavaScript de módulos ES que corre en el navegador.

```bash
# Opción 1: servidor local (recomendado, los módulos ES no cargan desde file://)
npm start            # o: python3 -m http.server 8000
# abre http://localhost:8000

# Pruebas unitarias (Node 18+)
npm test
```

## Estructura

```
index.html        Página, HUD y pantallas de inicio/fin
style.css         Estilos y efectos CRT
src/
  config.js       Valores de ajuste (velocidades, rangos, tiempos)
  content.js      Textos de las cintas
  world.js        Mapa (texto ASCII) y lectura de su leyenda
  logic.js        Funciones puras: colisiones, vista, señal, tiempo
  pathfind.js     BFS para la ruta de la Señal
  game.js         Estado y reglas del juego (update)
  render.js       Dibujo en canvas: mundo, linterna, estática
  audio.js        Siseo de estática con WebAudio
  main.js         Bucle, teclado/ratón y HUD
tests/            Pruebas con node:test
docs/DISENO.md    Documento de diseño: historia, mecánicas, pendientes
CLAUDE.md         Guía para Claude Code (y para cualquiera que contribuya con IA)
```

## Editar el juego

- **Mapa:** edita `MAP_ROWS` en `src/world.js`. La leyenda está arriba del archivo.
- **Historia:** edita `TAPES` en `src/content.js`.
- **Dificultad y sensación:** cambia los números de `src/config.js`.

Después de cualquier cambio, corre `npm test`.

## Licencia

Sin licencia por ahora (`UNLICENSED`). Pide permiso antes de reutilizar el código o los textos.
