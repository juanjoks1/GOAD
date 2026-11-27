# CIÉNAGA — Documento de diseño

## Premisa

En 2004 un topógrafo registró una construcción circular en una ciénaga que no aparecía en ningún catastro. Volvió tres veces; según sus notas, el pasillo era más largo cada vez. El jugador despierta en ese pantano, mirando el cielo nublado, sin objetivo explícito: *"Aquí no hay nada que encontrar. Solo camina."*

## Pilares

1. **Atmósfera antes que amenaza.** No hay enemigos ni sustos. La inquietud viene del aislamiento, el silencio y la arquitectura que no encaja.
2. **Un juego perdido de 2005.** 4:3, baja resolución, texturas sucias de 128 px, luz plana, niebla espesa, color de 16 bits, pantalla shareware.
3. **Lo natural cede a lo construido.** Barro y paja → concreto con patrones geométricos → una puerta metálica moderna. Cada paso hacia adentro es más artificial y más silencioso.

## Recorrido (fase 1)

| Zona | Qué hay | Sensación |
| --- | --- | --- |
| Inicio | Despiertas mirando al cielo; troncos altos de abedul; una cerca vieja con alambre guía hacia el norte | Desorientación |
| Pantano | Barro, charcos que reflejan el cielo, sauces, juncos, postes inclinados | Aislamiento |
| Zanja y puente | Agua turbia que corta el mapa; un puente de tablones con uno faltante y el pasamanos roto | Única salida |
| Claro | Choza circular de troncos y paja, rodeada por un anillo de postes verticales | Algo deliberado |
| Interior | Concreto gastado con arcada ciega, piso de hexágonos, espiral pintada frente a una escalera que baja | Contraste |
| Subterráneo | Pasillo estrecho y húmedo, bombillas cálidas (una fundida), tubería, gotas | Descenso |
| Puerta | Puerta cortafuegos moderna, luz de emergencia fría, LED verde, luz bajo la puerta, zumbido eléctrico | Fuera de lugar |

## Estética visual

- **Render:** 480×360 → pantalla completa 4:3 sin suavizado, con bandas negras.
- **Post (`retro.frag.glsl`):** desaturación con tinte verde, viñeta, grano a 24 fps, cuantización RGB565 con tramado Bayer 4×4, fundidos a negro.
- **CRT:** líneas horizontales al 7 % de opacidad, una por fila de la resolución interna.
- **Luz:** exterior con hemisférica + direccional, sin sombras. Interiores con luz horneada por vértice (como un *lightmap* de la época).
- **Niebla:** `FogExp2` gris pantano; se oscurece en la choza y casi a negro bajo tierra.

## Diseño sonoro (todo sintetizado)

- **Exterior:** viento (ruido marrón filtrado con ráfagas), siseo de juncos, cigarras (banda estrecha con trémolo), grillos (chirridos programados) y ranas lejanas ocasionales.
- **Pasos:** barro (ruido grave + chapoteo al despegar), agua, madera hueca del puente (con crujidos), concreto (seco, con eco bajo tierra).
- **Transición:** una única variable de zona (0 exterior, 0.3 choza, 1 subterráneo) controla el crossfade: el exterior se filtra y se apaga mientras sube un drone grave de osciladores levemente desafinados que respira lentamente. La reverb (con eco aleteante de pasillo estrecho) crece al bajar.
- **Puerta:** zumbido de red eléctrica de 60 Hz al acercarse; al abrir, pestillo, chirrido de bisagra y golpe pesado.

## Pendientes / siguientes fases

- [ ] Escena 2 (`subterraneo-2`) detrás de la puerta metálica: otra zona liminal.
- [ ] El pasillo "más largo cada vez": variar su longitud entre visitas.
- [ ] Menú de opciones (sensibilidad, volumen, resolución interna 480×360 / 640×480).
- [ ] Guardado de progreso.
- [ ] Controles táctiles / mando.
- [ ] Más detalle ambiental: niebla baja en capas, luciérnagas, troncos caídos.
- [ ] Notas del topógrafo como objetos legibles.
