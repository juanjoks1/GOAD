# CIÉNAGA

Prototipo de exploración en primera persona con estética de **juego de PC perdido de ~2005** y terror analógico/liminal tranquilo: sin sustos, solo atmósfera, aislamiento y arquitectura que no debería estar ahí.

Un pantano bajo niebla, una choza circular de troncos y paja, y debajo, una escalera de concreto que baja a un pasillo húmedo que termina en una puerta metálica moderna.

> Estado: **Fase 1** jugable. Pantalla inicial shareware, pantano explorable, choza con descenso subterráneo, render 4:3 a baja resolución y audio 100 % procedural. La puerta del fondo lleva a una pantalla final (gancho para la escena 2).

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas de lógica pura (node:test)
npm run build    # versión estática en dist/
```

Necesita Node 20.19+ y un navegador con WebGL 2. No hay archivos de imagen ni de audio: todas las texturas se pintan en `<canvas>` y todo el sonido se sintetiza con Web Audio.

### Android (APK)

```bash
npm run apk      # build de Vite + Gradle → dist-android/cienaga-debug.apk
```

Requiere JDK 17+ y el SDK de Android (`ANDROID_HOME`, o `android/local.properties` con `sdk.dir=...`). El APK sale firmado con la clave de depuración: se instala a mano activando "Instalar apps desconocidas". `android/` es un proyecto Gradle mínimo (una `Activity` con WebView a pantalla completa en horizontal, sin AndroidX ni permisos) que sirve `dist/` desde `assets/`; ábrelo con Android Studio si necesitas una versión release firmada.

## Controles

| Tecla | Acción |
| --- | --- |
| `W A S D` / flechas | Caminar |
| Ratón | Mirar (Pointer Lock; si no está disponible, arrastra con el botón) |
| `E` | Usar (la puerta metálica) |
| `Esc` | Pausa |
| `R` | Volver a empezar (en la pantalla final) |

En pantallas táctiles: un dedo en la **mitad izquierda** es una palanca para caminar, un dedo en la **mitad derecha** mira, y un **toque corto** empieza, usa la puerta, continúa tras la pausa o reinicia.

## Atajos para iterar

| URL | Qué hace |
| --- | --- |
| `/?skip-intro` | Empieza jugando, sin pantalla inicial |
| `/?skip-intro&spawn=choza` | Aparece en un punto: `inicio`, `puente`, `claro`, `choza`, `escalera`, `pasillo`, `puerta` |
| `/tools/texturas.html` | Galería de todas las texturas procedurales, repetidas 2×2 para ver costuras |

En desarrollo, `window.__cienaga` expone el jugador, la cámara, el audio y `teleport('pasillo')`.

## Estructura

```
index.html              Canvas 3D, capa de texto y líneas CRT
src/
  main.js               Arranque y parámetros de URL
  config.js             TODOS los valores de ajuste (resolución, post, niebla, velocidades, audio)
  core/                 Renderer retro (render target + post), entrada, RNG, ruido, matemáticas
  shaders/              GLSL: retro (post), cielo, agua; inyecciones para viento y terreno
  textures/             Generadores procedurales en canvas (barro, cortezas, follaje, paja, concreto, puerta…)
  world/                Lógica pura y probada: disposición, altura del terreno, colocación, física, zonas
  scene/                Construcción de mallas. registry.js registra las escenas
    swamp/              Escena 1: terreno, cielo, agua, vegetación, postes/puente, choza, subterráneo, luces horneadas
  player/               Controlador en primera persona y balanceo de cámara
  audio/                Director (buses y crossfade), ambiente del pantano, drone, pasos, efectos
  ui/                   Texto pixelado, pantallas (intro, pausa, aviso, final) y palanca táctil
  game/game.js          Bucle y estados: intro → despertar → jugar ⇄ pausa → salir → siguiente escena
  content/texts.js      Todos los textos del juego
tests/                  Pruebas con node:test
tools/texturas.html     Galería de texturas
android/                Envoltorio Android (WebView) para generar el APK
scripts/build-apk.mjs   npm run apk
docs/DISENO.md          Diseño, atmósfera y pendientes
legacy/                 El prototipo anterior (Terror Analógico, 2D en canvas), intacto
```

## Cómo extender

- **Shaders:** los `.glsl` de `src/shaders/` se importan con `?raw`; Vite recarga al guardar. El post-procesado está en `retro.frag.glsl` y sus parámetros en `POST` (`src/config.js`).
- **Texturas:** cada generador devuelve un canvas. Edita el archivo en `src/textures/` y revisa el resultado en `/tools/texturas.html`.
- **Nueva zona liminal:** crea `src/scene/<zona>/index.js` con la misma forma que `createSwampLevel` (escena, física, `spawn`, `interactables`, `update`, `dispose`) y regístrala en `src/scene/registry.js` con el id `subterraneo-2`: la puerta metálica la cargará automáticamente.

## Licencia

Sin licencia por ahora (`UNLICENSED`).
