# CLAUDE.md — Guía del proyecto Terror Analógico

Lee esto primero. Te ahorra explorar el repo a ciegas.

## Qué es

Juego de terror analógico (VHS, estática, found footage) en **HTML5 Canvas + JavaScript puro**.
Vista cenital con linterna. Un jugador, un mapa, tres cintas que reproducir en un VCR y una entidad (*la Señal*) que se mueve solo cuando no la miras.

- Idioma: **textos del juego y documentación en español**. Identificadores de código en inglés.
- Sin frameworks, sin bundler, sin dependencias de runtime. Módulos ES nativos.
- Dependencias de desarrollo: ninguna. Las pruebas usan `node:test` (incluido en Node 18+).

## Comandos

```bash
npm test     # 34 pruebas unitarias; deben pasar siempre
npm start    # servidor estático en http://localhost:8000
```

Para ver el juego en el navegador, sirve la carpeta con `npm start`. No abras `index.html` con `file://`: los módulos ES no cargan así.

## Mapa del código

| Archivo | Responsabilidad | ¿Tiene DOM? |
| --- | --- | --- |
| `src/config.js` | Constantes de ajuste | no |
| `src/content.js` | Textos de las cintas (`TAPES`) | no |
| `src/world.js` | `MAP_ROWS` (mapa ASCII), `parseWorld`, `isSolid` | no |
| `src/logic.js` | Colisiones, cono de linterna, señal, `formatTimestamp` | no |
| `src/pathfind.js` | `findPath` (BFS) | no |
| `src/game.js` | `createGame`, `update`: todas las reglas | no |
| `src/render.js` | Dibujo en canvas (`render`, `drawStatic`) | sí (canvas) |
| `src/audio.js` | Siseo de estática con WebAudio | sí (WebAudio) |
| `src/main.js` | Bucle, teclado, ratón, HUD y pantallas | sí |
| `index.html` | HUD y overlays; IDs usados por `main.js` | — |
| `style.css` | Estilos y efectos CRT | — |
| `tests/*.test.js` | Pruebas de lógica pura | — |

**Regla de oro:** la lógica (todo lo que no es `render.js`, `audio.js` o `main.js`) no toca el DOM. Así se prueba con `npm test`. Si necesitas lógica nueva, ponla en `logic.js`, `game.js` o `pathfind.js` y escribe su prueba.

## Convenciones

- **Mapa:** `MAP_ROWS` en `src/world.js`. Todas las filas deben medir lo mismo. Hay exactamente una `S`, una `E`, una `V`, una `X`, y tantas `T` como cintas en `TAPES`. `npm test` lo verifica; si cambias el mapa, corre las pruebas.
- **Cintas:** el orden de `TAPES` en `content.js` corresponde al orden de lectura de las `T` del mapa (arriba→abajo, izquierda→derecha). Si agregas una cinta, agrega también su `T` y actualiza el número esperado en `world.test.js` si cambia.
- **Valores de ajuste:** van en `src/config.js`, no escritos a mano dentro de la lógica.
- **Estado del juego:** `game.js` es la única fuente de verdad. `render.js` solo lee; `main.js` solo transmite la entrada.
- **IDs del HTML:** si cambias un `id` en `index.html`, cámbialo también en `main.js` (objeto `ui`).
- **Dependencias:** no agregues paquetes de runtime sin preguntar. Si hace falta una herramienta de desarrollo, avisa primero.

## Flujo de trabajo recomendado

1. Lee el archivo relevante antes de editarlo. El proyecto es pequeño; `src/game.js` y `src/config.js` cubren casi todo el comportamiento.
2. Haz el cambio más pequeño que resuelva lo pedido.
3. Corre `npm test`. Si falla, corrige antes de dar por terminado.
4. Si el cambio es visual (render, CSS, HUD), comprueba en el navegador con `npm start`. Las pruebas no cubren el dibujo.

## Qué no hacer

- No conviertas el proyecto a TypeScript, React ni a un bundler sin que el usuario lo pida.
- No cambies las reglas de colisión (`moveWithCollision`, `isSolid`) sin probar que el mapa sigue siendo recorrible (`findPath` de `tests/pathfind.test.js`).
- No dejes un `console.log` de depuración en `src/` al terminar.
- No escribas la narrativa en inglés: el tono y el idioma del juego son en español.

## Estado actual y pendientes

Ver `docs/DISENO.md` para el diseño completo, la historia y la lista de pendientes. Resumen corto:

- Hecho: mapa de un piso, 3 cintas, VCR, Señal con IA de ruta (BFS), linterna con cono, estática y audio básico.
- Pendiente: menú de pausa, más mapas, sustos con audio, guardado de progreso, controles táctiles.
