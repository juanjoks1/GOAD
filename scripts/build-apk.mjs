// Construye el APK de Android: build de Vite (dist/) + Gradle (assembleDebug).
// Requisitos: JDK 17 o más nuevo y el SDK de Android (ANDROID_HOME o android/local.properties).
// Resultado: dist-android/cienaga-debug.apk (firmado con la clave de depuración, para instalar a mano).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const androidDir = join(root, 'android');

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk && !existsSync(join(androidDir, 'local.properties'))) {
  console.error(
    'No encuentro el SDK de Android. Define ANDROID_HOME (p. ej. ~/Android/Sdk) o crea\n' +
      'android/local.properties con la línea: sdk.dir=/ruta/al/Android/Sdk',
  );
  process.exit(1);
}

await build({ logLevel: 'warn' });

const win = process.platform === 'win32';
execFileSync(win ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: win,
});

const apk = join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
const outDir = join(root, 'dist-android');
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'cienaga-debug.apk');
copyFileSync(apk, target);
process.stdout.write(`\nAPK listo: ${target}\n`);
