// Se importa antes que nada: sin gestión de color lineal, como en 2005.
// Colores, texturas y luces se usan tal cual (espacio "gamma"), lo que da sombras más duras y planas.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;
