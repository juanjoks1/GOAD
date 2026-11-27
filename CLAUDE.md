# CLAUDE.md — Guía del proyecto CIÉNAGA

Lee esto primero. (Gemini y otros asistentes: esta es también vuestra guía; ver `GEMINI.md`).

## Qué es

Prototipo de exploración en primera persona, terror analógico/liminal tranquilo (sin jumpscares), con estética de juego de PC de ~2005: render 4:3 a 480×360 escalado sin suavizado, color de 16 bits con tramado, niebla densa, luz plana sin sombras.

- **Stack:** Vite + JavaScript (módulos ES) + Three.js. Sin TypeScript, sin frameworks.
- **Idioma:** textos del juego y documentación en **español**; identificadores de código en inglés.
- **Sin assets externos:** texturas pintadas en canvas y audio sintetizado con Web Audio. No añadas archivos de imagen/audio sin preguntar.
- **Dependencias:** runtime solo `three`; desarrollo solo `vite`. No agregues paquetes sin preguntar.

## Comandos

```bash
npm run dev    # http://localhost:5173  (?skip-intro&spawn=choza para saltar directo a una zona)
npm test       # pruebas de lógica pura; deben pasar siempre
npm run build  # comprueba que el build de producción compila
```

Galería de texturas: `http://localhost:5173/tools/texturas.html`.

## Mapa del código

| Ruta | Responsabilidad | ¿DOM / Three? |
| --- | --- | --- |
| `src/config.js` | Todos los valores de ajuste | no |
| `src/content/texts.js` | Todos los textos | no |
| `src/core/math.js`, `rng.js`, `noise.js` | Utilidades puras | no |
| `src/world/*` | Disposición, terreno, colocación, física, zonas | **no (puro, probado)** |
| `src/player/headbob.js` | Balanceo de cámara | no |
| `src/scene/bake.js` | Luz horneada por vértice | no |
| `src/player/controller.js` | Jugador en primera persona | Three (cámara) |
| `src/core/renderer.js`, `src/shaders/*` | Render retro y GLSL | sí |
| `src/textures/*` | Texturas procedurales | sí (canvas) |
| `src/scene/**` | Mallas de cada escena; `registry.js` | sí |
| `src/audio/*` | Web Audio | sí |
| `src/ui/*`, `src/game/game.js`, `src/main.js` | Interfaz, bucle, estados | sí |

**Regla de oro:** todo lo que decide *dónde* está algo, *si se puede pisar* o *qué tan adentro estás* va en `src/world/` sin importar Three.js ni el DOM, y tiene prueba en `tests/`. Las escenas solo dibujan lo que `world/` describe.

## Convenciones

- **Coordenadas:** metros; x = este, z = sur; el jugador empieza mirando a −z. La choza está en `HUT` (`src/world/layout.js`); escalera y pasillo usan z relativo a la choza.
- **Valores de ajuste** en `src/config.js`, nunca escritos a mano en la lógica.
- **Color:** `ColorManagement` está desactivado a propósito (flujo "gamma" como en 2005). Las texturas usan `NoColorSpace`.
- **Interiores:** usan `MeshBasicMaterial` con luz horneada por vértice (`bake()` + `src/scene/swamp/lighting.js`). El exterior usa `MeshLambertMaterial` con luz hemisférica + direccional, sin sombras.
- **Geometría fusionada:** la vegetación y los postes se fusionan por material; todas las piezas de un grupo deben tener los mismos atributos (`position`, `normal`, `uv`, `color`, y `sway` en el follaje).
- **Determinismo:** todo lo procedural usa semillas fijas (`createRng`, `fbm2D`).
- **Escenas nuevas:** `src/scene/<zona>/index.js` + entrada en `src/scene/registry.js`. La puerta metálica busca el id `subterraneo-2`.

## Flujo de trabajo

1. Lee el archivo antes de editarlo; `config.js` y `world/layout.js` explican casi todo.
2. Haz el cambio más pequeño que resuelva lo pedido.
3. `npm test`. Si tocas el mapa, la física o la colocación, la prueba de recorrido (`tests/physics.test.js`, inicio → puerta metálica) debe seguir pasando.
4. Si el cambio es visual o de audio, compruébalo en el navegador con `npm run dev` (las pruebas no cubren el dibujo).

## Qué no hacer

- No conviertas a TypeScript, React ni otro motor sin que el usuario lo pida.
- No añadas sombras dinámicas, posprocesado moderno (bloom, SSAO) ni texturas de alta resolución: rompen la estética.
- No añadas sustos repentinos: el terror aquí es atmosférico.
- No dejes `console.log` de depuración en `src/`.
- No escribas textos del juego en inglés.
- No toques `legacy/` salvo que se pida: es el prototipo anterior (2D), con sus propias pruebas (`npm run test:legacy`).
