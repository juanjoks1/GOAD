# CLAUDE.md — Guía del proyecto CIÉNAGA

Lee esto primero. (Gemini y otros asistentes: esta es también vuestra guía; ver `GEMINI.md`).

## Qué es

Juego de exploración en primera persona, terror analógico con entidades que te cazan (te ven, gritan y te persiguen; si te alcanzan, vuelves al último punto de control), con estética de juego de PC de ~2005: render 4:3 a 480×360 escalado sin suavizado, color de 16 bits con tramado, niebla densa, luz plana sin sombras.

- **Stack:** Vite + JavaScript (módulos ES) + Three.js. Sin TypeScript, sin frameworks.
- **Idioma:** textos del juego y documentación en **español**; identificadores de código en inglés.
- **Sin assets externos:** texturas pintadas en canvas y audio sintetizado con Web Audio. No añadas archivos de imagen/audio sin preguntar.
- **Dependencias:** runtime solo `three`; desarrollo solo `vite`. No agregues paquetes sin preguntar.

## Comandos

```bash
npm run dev    # http://localhost:5173  (?skip-intro&spawn=choza para saltar directo a una zona)
npm test       # pruebas de lógica pura; deben pasar siempre
npm run build  # comprueba que el build de producción compila
npm run apk    # APK de Android (dist-android/cienaga-debug.apk); requiere JDK 17+ y ANDROID_HOME
```

Galería de texturas: `http://localhost:5173/tools/texturas.html`.

## Mapa del código

| Ruta | Responsabilidad | ¿DOM / Three? |
| --- | --- | --- |
| `src/config.js` | Todos los valores de ajuste | no |
| `src/content/texts.js` | Todos los textos | no |
| `src/core/math.js`, `rng.js`, `noise.js` | Utilidades puras | no |
| `src/world/*` | Disposición, terreno, colocación, física, zonas, entidades | **no (puro, probado)** |
| `src/player/headbob.js` | Balanceo de cámara | no |
| `src/scene/bake.js` | Luz horneada por vértice | no |
| `src/player/controller.js` | Jugador en primera persona | Three (cámara) |
| `src/core/renderer.js`, `src/shaders/*` | Render retro y GLSL | sí |
| `src/textures/*` | Texturas procedurales (y los recortes de las entidades en `entities.js`) | sí (canvas) |
| `src/scene/**` | Mallas de cada escena; `registry.js` | sí |
| `src/audio/*` | Web Audio | sí |
| `src/ui/*`, `src/game/game.js`, `src/main.js` | Interfaz, controles táctiles, bucle, estados | sí |
| `android/` | Envoltorio Android: una `Activity` con WebView que sirve `dist/` | Java |

**Regla de oro:** todo lo que decide *dónde* está algo, *si se puede pisar* o *qué tan adentro estás* va en `src/world/` sin importar Three.js ni el DOM, y tiene prueba en `tests/`. Las escenas solo dibujan lo que `world/` describe.

## Convenciones

- **Coordenadas:** metros; x = este, z = sur; el jugador empieza mirando a −z. La choza está en `HUT` (`src/world/layout.js`); escalera y pasillo usan z relativo a la choza.
- **Valores de ajuste** en `src/config.js`, nunca escritos a mano en la lógica.
- **Color:** `ColorManagement` está desactivado a propósito (flujo "gamma" como en 2005). Las texturas usan `NoColorSpace`.
- **Interiores:** usan `MeshBasicMaterial` con luz horneada por vértice (`bake()` + `src/scene/swamp/lighting.js`). El exterior usa `MeshLambertMaterial` con luz hemisférica + direccional, sin sombras.
- **Geometría fusionada:** la vegetación y los postes se fusionan por material; todas las piezas de un grupo deben tener los mismos atributos (`position`, `normal`, `uv`, `color`, y `sway` en el follaje).
- **Determinismo:** todo lo procedural usa semillas fijas (`createRng`, `fbm2D`).
- **Escenas nuevas:** `src/scene/<zona>/index.js` + entrada en `src/scene/registry.js`. La puerta metálica busca el id `subterraneo-2`.
- **Controles:** toda la entrada pasa por `src/core/input.js` (teclado, ratón y táctil). Cada texto que menciona controles tiene variante táctil en `content/texts.js`.
- **Entidades:** la IA (quieta → alerta → persecución → búsqueda → regreso; repelida por la cruz; atrapar) es una máquina de estados pura en `src/world/entities.js` con pruebas en `tests/entities.test.js`; `src/scene/swamp/entities.js` solo las dibuja como recortes que giran hacia la cámara y avanzan a saltos. Cada una tiene territorio (`TERRITORY`) y línea de visión propia. Ajustes en `ENTITIES` y `CROSS` (`config.js`); voces en `src/audio/voices.js` y efectos en `src/audio/scares.js`; puntos de control en `src/world/checkpoints.js`. Los diseños son propios (inspirados en referencias); no metas imágenes ni audios de otros autores sin permiso.
- **Defensas del jugador** (no las quites sin preguntar: son el núcleo del juego): no mirarlas (van más lentas), esconderse agachado en vegetación, salir de su territorio, la cruz (se gasta) y correr (aguante, hace ruido).
- **Android:** el juego no sabe que está en Android; `android/` solo empaqueta `dist/`. No añadas AndroidX, Capacitor ni permisos sin preguntar.

## Flujo de trabajo

1. Lee el archivo antes de editarlo; `config.js` y `world/layout.js` explican casi todo.
2. Haz el cambio más pequeño que resuelva lo pedido.
3. `npm test`. Si tocas el mapa, la física o la colocación, la prueba de recorrido (`tests/physics.test.js`, inicio → puerta metálica) debe seguir pasando.
4. Si el cambio es visual o de audio, compruébalo en el navegador con `npm run dev` (las pruebas no cubren el dibujo).

## Qué no hacer

- No conviertas a TypeScript, React ni otro motor sin que el usuario lo pida.
- No añadas sombras dinámicas, posprocesado moderno (bloom, SSAO) ni texturas de alta resolución: rompen la estética.
- Las entidades son agresivas a propósito (lo pidió el usuario), pero siempre hay una forma de escapar: no hagas persecuciones imposibles. Cada entidad avisa antes de cazar (grito, interferencia).
- No dejes `console.log` de depuración en `src/`.
- No escribas textos del juego en inglés.
- No toques `legacy/` salvo que se pida: es el prototipo anterior (2D), con sus propias pruebas (`npm run test:legacy`).
