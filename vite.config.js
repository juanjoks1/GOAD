import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build (dist/) funciona desde cualquier carpeta o servidor estático.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900, // Three.js ocupa ~600 kB
  },
  server: {
    port: 5173,
  },
});
