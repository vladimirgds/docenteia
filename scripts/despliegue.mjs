#!/usr/bin/env node
/**
 * QUE UN DESPLIEGUE CONSTRUYA LA APLICACIÓN, VENGA COMO VENGA.
 *
 * Esto existe por un fallo que costó cinco entregas. El servicio de Render se
 * creó cuando la aplicación era el prototipo de Express: su orden de
 * construcción era `npm install` y la de arranque `npm start`, y con Express
 * bastaba. La aplicación de hoy es Next.js y `npm start` (`next start`) EXIGE un
 * `next build` previo; sin él muere al arrancar, la plataforma da el despliegue
 * por fallido y mantiene vivo el último contenedor que sí arrancó. Resultado: el
 * cliente abría la URL de las guías, veía una versión de agosto y decía, con
 * toda la razón, "está igual, no has cambiado nada".
 *
 * Corregir `render.yaml` no basta: una plataforma sólo relee el blueprint si el
 * servicio sigue enlazado a él. Si sus ajustes se tocaron a mano —que es lo que
 * pasa— manda el panel, y desde el repositorio no se puede cambiar.
 *
 * Lo que sí se puede es aprovechar el único gancho que se ejecuta SIEMPRE:
 * `postinstall`. Lo llama `npm install` y también `npm ci`, así que aunque la
 * orden de construcción sea la del prototipo, la aplicación se construye igual.
 *
 * DÓNDE HACE QUÉ
 *
 *   · En un portátil (`npm install` de toda la vida): sólo genera el cliente de
 *     Prisma. Nadie quiere esperar una compilación por instalar una dependencia.
 *   · En Vercel: genera el cliente y para. `vercel-build` hace el resto, y
 *     compilar dos veces es pagar el doble por lo mismo.
 *   · En Render (o en cualquier sitio con `CONSTRUIR_AL_INSTALAR=1`): prepara la
 *     base de datos y COMPILA.
 *
 * LA BASE DE DATOS NO PUEDE TUMBAR EL DESPLIEGUE.
 *
 * Migrar y sembrar se intentan, y si fallan se dice muy alto y se sigue. Es
 * deliberado y es la lección de este fallo: un despliegue que no sale deja a
 * todo el mundo mirando una versión vieja sin enterarse; un despliegue que sale
 * con la base a medias se ve en `/api/health` —"sin_migrar", "sin_sembrar"— y se
 * arregla en cinco minutos. Compilar, en cambio, sí es obligatorio: si el código
 * no compila, ese despliegue no debe salir.
 */

import { execSync } from "node:child_process";
import { delimiter, join } from "node:path";

// `prisma` y `next` viven en `node_modules/.bin`. Al llamarlo npm ya está en el
// PATH, pero este guion también se ejecuta a mano para probarlo: se añade aquí
// para que funcione igual en los dos casos.
const entorno = {
  ...process.env,
  PATH: `${join(process.cwd(), "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
};
const enVercel = Boolean(entorno.VERCEL);
const enRender = entorno.RENDER === "true" || Boolean(entorno.RENDER_SERVICE_ID);
const forzado = entorno.CONSTRUIR_AL_INSTALAR === "1";
const simulacion = process.argv.includes("--simulacion");

const ejecutar = (orden, { obligatorio }) => {
  console.log(`\n▸ ${orden}`);
  if (simulacion) return true;
  try {
    execSync(orden, { stdio: "inherit", env: entorno });
    return true;
  } catch (e) {
    const motivo = e instanceof Error ? e.message.split("\n")[0] : "desconocido";
    if (obligatorio) {
      console.error(`\n✗ ${orden} — ${motivo}`);
      process.exit(1);
    }
    console.warn(`\n⚠ ${orden} — ${motivo}`);
    console.warn("  El despliegue continúa. Lo que falte se ve en /api/health:");
    console.warn("  sin_configurar (faltan variables) · sin_migrar (faltan tablas) · sin_sembrar (falta el banco).");
    return false;
  }
};

// El cliente de Prisma hace falta en todas partes, y no necesita base de datos.
ejecutar("prisma generate", { obligatorio: true });

if (enVercel) {
  console.log("\n· Vercel: el resto lo hace `vercel-build`.");
} else if (enRender || forzado) {
  console.log(`\n· ${enRender ? "Render" : "Construcción forzada"}: se prepara la base y se compila.`);
  ejecutar("prisma migrate deploy", { obligatorio: false });
  ejecutar("node --experimental-strip-types prisma/seed.ts", { obligatorio: false });
  ejecutar("next build", { obligatorio: true });
  console.log("\n✓ Aplicación construida: `next start` ya tiene qué servir.");
} else {
  console.log("\n· Instalación local: nada más que hacer (usa `npm run build` cuando quieras compilar).");
}
