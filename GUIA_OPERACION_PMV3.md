# Guía de operación — PMV 3

Para quien despliega, actualiza y mantiene MentorIA Math. Complementa el [`README.md`](README.md) (puesta en marcha desde cero) y [`render.yaml`](render.yaml) / [`vercel.json`](vercel.json) (despliegue).

---

## 1. Qué versión está funcionando

```bash
curl -s https://<tu-dominio>/api/health
```

| Campo | Qué dice |
| --- | --- |
| `version` | El **commit** desplegado: `RENDER_GIT_COMMIT` (Render), `VERCEL_GIT_COMMIT_SHA` (Vercel) o `COMMIT` (cualquier otro sitio: ponla en el despliegue). Sin ninguna, `desconocido`. |
| `modo_ia` | `gemini` si hay `GEMINI_API_KEY`; `mock` (modo demostración) si no. |
| `base_datos` | `ok` o el motivo del fallo. |
| `voz` | Si hay proveedor de voz del servidor configurado; si no, el tutor habla con la voz del navegador. |

Una cabecera `x-powered-by: Next.js` confirma que se sirve la aplicación y no el prototipo antiguo (`Express`).

---

## 2. Configuración (variables de entorno)

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Sí | PostgreSQL de la aplicación (pooler en Supabase). |
| `DIRECT_URL` | Sí | Conexión directa que usa Prisma para migrar. |
| `AUTH_SECRET` | Sí | Firma de las sesiones. |
| `AUTH_TRUST_HOST` | En la nube | `true` detrás de un proxy (Render, Vercel). |
| `GEMINI_API_KEY` | No | Sin ella, la IA funciona en **modo demostración** (no gasta cuota). |
| `GEMINI_MODEL` | No | Modelo de las lecciones (por defecto `gemini-2.5-flash-lite`). |
| `GEMINI_MODEL_PROCEDIMIENTOS`, `GEMINI_MODEL_FICHAS` | No | Modelo del agente de procedimientos y del de fichas de método (por defecto `gemini-2.5-flash`). |
| `LIMITE_IA_MIN`, `LIMITE_IA_HORA`, `LIMITE_IA_DIA`, `LIMITE_GENERAL_MIN` | No | Topes de consumo de IA por IP y general. |
| `VOZ_PROVEEDOR` + `GOOGLE_TTS_API_KEY` o `ELEVENLABS_API_KEY` (`ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODELO`, `ELEVENLABS_VELOCIDAD`) | No | Voz neuronal del servidor. Sin ellas, la voz del navegador (gratuita). |
| `COMMIT` | No | Commit desplegado, si la plataforma no lo da. |
| `SEED_ADMIN_EMAIL` / `_PASSWORD`, `SEED_DIRECTOR_…`, `SEED_DOCENTE_…` | No | Cuentas iniciales que crea la siembra. **Cámbialas en producción.** |

Ninguna clave se guarda en el repositorio: en Render se pegan en el panel (las marcadas `sync: false`), en Vercel en *Environment Variables*.

---

## 3. Despliegue

La secuencia está escrita en **un solo sitio**, `npm run vercel-build`, y la usan Render y Vercel:

```
prisma generate → prisma migrate deploy → siembra (idempotente) → next build
```

- **Render:** `render.yaml` (Blueprint). Cada *push* a la rama configurada despliega.
- **Vercel:** `vercel.json`. Cada *push* despliega; las ramas distintas de la de producción, como *Preview*.
- **Otro servidor:** `npm ci && npm run vercel-build && npm start` con las variables puestas (y `COMMIT=$(git rev-parse HEAD)`).

Comprobación tras desplegar: `/api/health` con el `version` esperado, `base_datos: ok`, y entrar como docente y como alumno.

---

## 4. Migraciones

Todas son **aditivas** (tablas o columnas nuevas, opcionales): ninguna borra ni reescribe datos existentes. Cada `migration.sql` lleva en su cabecera la **marcha atrás** exacta.

| Migración | Qué añade |
| --- | --- |
| `20261117120000_pmv3_hito1_bancos_docentes` | Bancos por docente: ámbito, procedencia, estado y versión. |
| `20261118100000_pmv3_hito2_procedimientos` | Procedimientos del editor docente. |
| `20261119100000_pmv3_hito4_tutoria` | Sesiones y eventos de tutoría adaptativa. |
| `20261120100000_pmv3_hito1_evaluacion_segura` | Evaluación segura: copias congeladas, intentos y respuestas. |
| `20261120200000_pmv3_hito2_orquestador` | Prácticas guiadas y decisiones pedagógicas. |
| `20261122100000_pmv3_hito5a_fichas_metodo` | Fichas de método y sus versiones. |
| `20261126100000_pmv3_hito5b_ficha_en_tarea` | Ficha de método congelada en una tarea (4 columnas opcionales en `tareas`). *El nombre conserva «5b» por historia; es la ampliación del H5A.* |
| `20261127100000_pmv3_h4_habilidades` | Habilidades, prerrequisitos y registro por habilidad; columna opcional `habilidadId` en `ejercicios` y `sesiones_tutoria`. |
| `20261127110000_pmv3_h5b_consumo` | Registro del consumo de IA y voz. |

Aplicar: `npx prisma migrate deploy` (lo hace el despliegue). Ver el estado: `npx prisma migrate status`.

**Antes de migrar en producción:** copia de seguridad de la base (`pg_dump`, o el *backup* del proveedor).

---

## 5. Reversión

### 5.1 Volver a la versión anterior de la aplicación

- **Render:** *Deploys* → el despliegue anterior → *Rollback*.
- **Vercel:** *Deployments* → el anterior → *Promote to Production* (o *Instant Rollback*).
- **Otro servidor:** desplegar el commit anterior.

Como las migraciones son aditivas, **la versión anterior funciona con la base ya migrada** (ignora las tablas y columnas nuevas). En la mayoría de los casos basta con esto.

### 5.2 Deshacer también la base de datos (sólo si hace falta)

En orden **inverso** (de la más nueva a la más vieja), y sólo las que se quieran deshacer:

1. Copia de seguridad.
2. Ejecutar el SQL de «MARCHA ATRÁS» de la cabecera de su `migration.sql` (por ejemplo, `DROP TABLE "consumo_servicios";`).
3. Borrar su fila del historial de Prisma:
   `DELETE FROM "_prisma_migrations" WHERE migration_name = '<carpeta de la migración>';`
4. Desplegar la versión de la aplicación correspondiente.

Deshacer una migración **borra los datos** de lo que añadía (por ejemplo, el registro de habilidades o de consumo): por eso 5.1 es la opción por defecto.

---

## 6. Consumo de IA y voz

- Informe (SUPERADMIN): `GET /api/admin/consumo?dias=30` → filas por servicio, origen y modelo con llamadas, aciertos de caché, fallos, tokens de entrada/salida/total y caracteres de voz.
- Se registra **cada llamada real** a Gemini y cada síntesis de voz del servidor. No se registran (porque no gastan): las lecciones que resuelve el motor determinista, las repetidas desde la caché y el modo demostración.
- Orden de magnitud medido (ver [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md) §H5B): ≈ 5 840 tokens por lección con IA (`flash-lite`), ≈ 15 000 por borrador de ficha de método (`flash`). El coste es tokens × la tarifa vigente del proveedor.
- Para frenar el gasto: `LIMITE_IA_*`, o quitar `GEMINI_API_KEY` (modo demostración).

---

## 7. El profesor 3D

- Modelo: `public/modelos/profesor/profesor.glb` (CC0, ver `LICENCIA.md` en la misma carpeta). Se carga **sólo** en la pizarra, sólo con WebGL y sólo si el alumno no eligió 2D.
- Sustituirlo: exportar desde Blender un glTF binario con el mismo nombre, conservando los huesos `Head`, `UpperArm.R`, `Hand.R`, la expresión `Surprised` y las animaciones `Idle`, `Wave`, `ThumbsUp`. Si falla al cargar, la pizarra usa el profesor 2D sin romper la clase.

---

## 8. Comprobar que todo sigue funcionando

```bash
npm run typecheck          # tipos
npm run dev                # en otra terminal, SIN GEMINI_API_KEY
npm test                   # todas las baterías (PMV 1, 2 y 3), unas decenas de minutos
```

Las baterías de navegador necesitan Chrome (o `QA_CHROME=<ruta>`). La medición de consumo con Gemini real va aparte, porque gasta cuota:
`QA_CONSUMO_REAL=1 node --experimental-strip-types --no-warnings qa/pmv3-h5b-consumo.mjs` (con la app arrancada **con** `GEMINI_API_KEY`).

---

## 9. Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| `/api/health` → `base_datos` con error | `DATABASE_URL` mal, base caída o migraciones sin aplicar (`npx prisma migrate deploy`). |
| `modo_ia: mock` en producción | Falta `GEMINI_API_KEY`. |
| Gemini `400 User location is not supported` | Región no admitida: desplegar en EE. UU. (Render `oregon`). |
| Gemini `429` | Cuota agotada o proyecto sin facturación. |
| El profesor sale en 2D | El navegador no tiene WebGL, el modelo no cargó, o el alumno eligió 2D (botón «Ver profesor en 3D»). |
| `prisma generate` falla con `EPERM` en Windows | La aplicación en marcha tiene bloqueado el motor de Prisma: pararla y repetir. |
