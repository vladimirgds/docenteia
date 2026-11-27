# PMV 3 — Cierre frente al documento del cliente (PMV3.docx)

Este documento recorre el Word **fila por fila** (H1 → H5B) y, para cada entregable, dice **dónde está** y **con qué prueba se demuestra**. Lo que ya estaba entregado remite a su documento; lo que se ha completado en este cierre se describe aquí.

Las baterías se ejecutan con la aplicación en marcha (`npm run dev`) y **sin** `GEMINI_API_KEY` salvo donde se indica. Las que dicen «Chrome real» abren un Chrome de verdad con Playwright.

---

## Resumen

| Hito del Word | Estado | Evidencia principal |
| --- | --- | --- |
| **H1** Bancos de contenido y evaluación segura | Entregado | `pmv3-hito1` · 76 · `pmv3-hito1-evaluacion` · 61 |
| **H2** Orquestador pedagógico y validación de pasos | Entregado | `pmv3-hito2` · 60 · `pmv3-hito2-orquestador` · 82 · `pmv3-hito2-navegador` · 16 (Chrome) |
| **H3A** Pizarra conversacional y puntero láser | Entregado; **completado en este cierre**: analogía, apariciones repetidas, ids estables, medición del desfase | `pmv3-h3a-analogia` · 23 (Chrome) · `pmv3-hito3` · 68 (Chrome) · `pmv3-pizarra-sincronia` · 51 |
| **H3B** Profesor virtual 3D | **Completado en este cierre**: personaje GLB con esqueleto y expresiones en React Three Fiber, carga bajo demanda, respaldo 2D | `pmv3-h3b-profesor` · 42 (Chrome, escritorio y móvil) |
| **H4** Refuerzo adaptativo, voz y analítica | Entregado; **completado en este cierre**: habilidades y prerrequisitos sin ciclos, registro por habilidad, transcripción editable, mismas métricas y filtros en panel/PDF/Excel | `pmv3-h4-habilidades` · 40 · `pmv3-tutor-motor` · 22 · `pmv3-piloto` · 58 (Chrome) |
| **H5A** Agente de IA y editor de métodos | Entregado (+ ampliación: la ficha dentro de una tarea evaluable) | `pmv3-hito5a-fichas` · 121 · `pmv3-hito5a-navegador` · 36 (Chrome) · `pmv3-hito5a-ficha-en-tarea` · 29 |
| **H5B** Piloto integrado y entrega | **Completado en este cierre**: medición del consumo de IA y voz, guía de operación | `pmv3-h5b-consumo` · 14 (con Gemini real) · `pmv3-piloto` · 58 · [`GUIA_OPERACION_PMV3.md`](GUIA_OPERACION_PMV3.md) |

---

## H1 · Bancos de contenido y evaluación segura

Ver [`ENTREGA_PMV3_HITO1.md`](ENTREGA_PMV3_HITO1.md) y [`ENTREGA_PMV3_HITO1_EVALUACION.md`](ENTREGA_PMV3_HITO1_EVALUACION.md): banco maestro, banco privado por docente (Kim empieza vacío), borradores de IA, migración aditiva conservando los ids, permisos en servidor, ejercicios y rúbricas congelados al asignar, nota calculada en el servidor, reenvíos y reintentos en transacción; el diagnóstico general sigue funcionando.

## H2 · Orquestador pedagógico y validación de pasos

Ver [`ENTREGA_PMV3_HITO2_ORQUESTADOR.md`](ENTREGA_PMV3_HITO2_ORQUESTADOR.md): en `2(x+4)=3x-1` acepta `2x+8=3x-1`, rechaza `2x+4=3x-1` y explica el error; la política de revelación se aplica a texto, audio y LSG; cada decisión queda registrada con su motivo.

## H3A · Pizarra conversacional y puntero láser

Base en [`ENTREGA_PMV3_HITO3.md`](ENTREGA_PMV3_HITO3.md). Completado ahora:

| Pide el Word | Qué hay |
| --- | --- |
| **Solicitar una analogía** y **volver al paso** | Cada término tocable admite una `analogia` (la escribe el docente en el editor de procedimientos o la propone la IA). Tras tocar el término aparece **«Ver una analogía»**: se dice en voz alta, con el láser sobre el término, y se queda a la vista; **«Volver al paso»** retoma la narración donde iba. |
| **Identificadores estables por paso, miembro y aparición** | Cada término lleva `pzt-K` y además `pzm-M` (miembro de la igualdad: 0 izquierdo, 1 derecho) y `pza-A` (aparición). [`latex-terminos.ts`](lib/pizarra/latex-terminos.ts). |
| **Un número o expresión repetido**: el puntero señala la aparición correcta al **pausar, repetir y redimensionar** | El término admite `aparicion` (1 = la primera). Probado con la `x` de `2(x + 4) = 3x - 1`: el láser va a la **segunda** `x` (miembro derecho), se queda en pausa, vuelve al repetir y sigue sobre ella al pasar a **tableta (820 px)**, **móvil (390 px)** y de vuelta a escritorio. Se recalcula con `ResizeObserver` y además con `resize` de la ventana y del `visualViewport` (zoom del navegador, giro del móvil). Una aparición que no existe se rechaza al guardar. |
| **Al tocar el 2 de 2(x+4), el tutor explica la distributiva** | Demostración en `pmv3-h3a-analogia`: tocar el 2 → explicación de la propiedad distributiva, con el láser sobre ese 2 → analogía → volver al paso → responder «9» → correcto. |
| **Medición del desfase** | Del `onstart` del audio al láser colocado sobre el término, en Chrome real: **mediana 6 ms, p95 24 ms, máximo 24 ms** (12 locuciones), más **450 ms** de la transición visual del punto. Muestras en `qa/evidencia/desfase-laser.json`. La medición la hace la propia pizarra (`window.__pzDesfases`, atributo `data-desfase-ms`). |
| Responder por voz con **transcripción editable** (H4) | Al responder hablando, lo entendido queda en el campo con el aviso «Entendí «…». Revisa o corrige tu respuesta y pulsa Responder»: **no se corrige hasta que el alumno lo confirma**. |

## H3B · Profesor virtual 3D

| Pide el Word | Qué hay |
| --- | --- |
| **Personaje GLB con esqueleto y expresiones en Three.js y React Three Fiber** | [`profesor-glb.tsx`](components/pizarra/profesor-glb.tsx): `@react-three/fiber` 9.8.1 + `GLTFLoader`. Modelo `public/modelos/profesor/profesor.glb` (glTF 2.0, esqueleto, 3 expresiones faciales, 14 animaciones). |
| **Sincronizar labios con marcas de voz** | El sintetizador emite una marca por palabra (`onboundary`); la pizarra la publica como evento `pz-marca-voz` y la boca (expresión del modelo) se abre con cada marca y se cierra sola. Sin marcas (voz desactivada), se mueve a ritmo mientras habla. |
| **Orientar brazo y mirada al objetivo del LSG** y que **el rayo termine sobre el término activo** | Tras la animación, el brazo derecho se orienta al objetivo (rotación del hueso calculada en el espacio del mundo) y la cabeza gira hacia él. La posición de la mano se proyecta a la página y un **rayo** va de la mano al punto del láser, que está sobre el término. Probado: el rayo empieza dentro del profesor y termina dentro de la caja del término, en escritorio y en móvil. |
| **Explica, señala, pregunta, espera y da una pista** | Gestos `explica` (habla), `senala` (brazo + rayo), `pregunta` (animación «Wave» al terminar la explicación), `espera` (mira al alumno) y `pista` (animación «ThumbsUp»). |
| **Cargar el 3D bajo demanda** | three.js y React Three Fiber no van en el paquete inicial: se importan con `next/dynamic` sólo si hay WebGL y el alumno no eligió 2D. Probado: **en modo 2D el `.glb` ni se descarga**. |
| **Mantener el respaldo 2D** y **repetir el recorrido en 2D** | [`profesor-2d.tsx`](components/pizarra/profesor-2d.tsx): profesor en SVG que hace lo mismo (boca con las marcas de voz, brazo que señala, rayo, pregunta, espera, pista). Se usa sin WebGL, si el modelo no carga (límite de errores) o si el alumno lo elige con **«Ver profesor en 2D»** (se recuerda). El recorrido completo se repite en 2D en la batería. |
| **Escritorio y móvil** | `pmv3-h3b-profesor`: recorrido 3D en escritorio (1360 px), 2D en escritorio y 3D en móvil (390 px). Capturas en `qa/evidencia/profesor-3d-escritorio.png`, `profesor-2d-escritorio.png`, `profesor-3d-movil.png`. |
| **Modelo editable con su licencia** | `public/modelos/profesor/LICENCIA.md`: «RobotExpressive» de Tomás Laulhé (Quaternius), modificado por Don McCurdy, **CC0 1.0** (dominio público: uso, modificación y redistribución libres, también comerciales). Se edita en Blender (Importar → glTF 2.0). Si se sustituye, conviene conservar los nombres de huesos y expresiones que usa la aplicación (están en el mismo archivo). |

## H4 · Refuerzo adaptativo, voz y analítica

Base en [`ENTREGA_PMV3_HITO4.md`](ENTREGA_PMV3_HITO4.md) (pistas, repaso, regreso al paso, equivalente, PDF y Excel). Completado ahora:

| Pide el Word | Qué hay |
| --- | --- |
| **Modelar habilidades y prerrequisitos sin ciclos** | Tablas `habilidades` y `prerrequisitos_habilidad`. Pantalla [`/docente/habilidades`](app/docente/habilidades/page.tsx) y API `/api/docente/habilidades`. Cada arista se comprueba **antes** de guardarse, dentro de una transacción con cerrojo: un ciclo se rechaza con **409** y se explica («Ley de los signos» → «Reducir términos semejantes» → «Ley de los signos»). Las habilidades son privadas del docente. |
| **Registrar errores, pistas e intentos por habilidad** | Tabla `registros_habilidad` (intentos, errores, aciertos, pistas, repasos por alumno y habilidad); la sesión de tutoría guarda su habilidad. |
| **Bloqueo → repaso → retorno → ejercicio equivalente** | Ante un bloqueo, el tutor abre el **repaso del prerrequisito más cercano** que tenga uno publicado (si ninguno, el de la propia habilidad; si tampoco, el comportamiento anterior por tema). Al cerrarlo vuelve **a ese mismo ejercicio**; al acertar propone un equivalente **de la misma habilidad**. |
| **Transcripción editable antes de corregir por voz** | Ver H3A: la respuesta dictada queda en el campo para revisarla; no se corrige sola. |
| **Mismas métricas y filtros en panel, PDF y Excel** | Las columnas se definen **una vez** (`COLUMNAS_ALUMNO`, `COLUMNAS_TUTORIA`, `COLUMNAS_HABILIDADES` en [`exportar.ts`](lib/docente/exportar.ts)) y las tres vistas las usan. El panel `/docente/tutoria` tiene un **filtro por aula** y sus botones de exportar llevan el **mismo filtro** (`?aulaId=`). Se añadió «Bloqueos» al PDF (antes sólo estaba en el panel y en el Excel), «Habilidad» y «Equivalente resuelto». |
| **Caso de recuperación con 2x − 3x** | `pmv3-h4-habilidades`: «2x - 3x = 5» enlazado a «Reducir términos semejantes» (que requiere «Ley de los signos»). Tres errores de signo → dos pistas y el **«Repaso de signos»** → vuelve al ejercicio → acierta (−5) → equivalente «4x - 6x = 8» → lo resuelve (−4). Registro: 4 intentos, 3 errores, 1 acierto, 2 pistas, 1 repaso. El docente lo ve en el **panel**, el **Excel** (hoja «Habilidades» y columna «Equivalente resuelto») y el **PDF**, con el filtro de aula; otro docente no recibe esos datos ni pidiendo el aula por su id. |

## H5A · Agente de IA y editor de métodos

Ver [`ENTREGA_PMV3_HITO5A_FICHAS.md`](ENTREGA_PMV3_HITO5A_FICHAS.md) y su ampliación [`ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md`](ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md): «Suma de fracciones» y la regla de la cadena publicadas desde el panel sin cambiar código; pista si el alumno omite `6x`; reutilización con `(5x^3-2)^2`; pistas por respuesta errónea típica (signo, exponente); la ficha aplicada dentro de una tarea evaluable. Probado también con **Gemini real** (una llamada de la regla de la cadena: verificada por el motor sin errores).

## H5B · Piloto integrado y entrega

| Pide el Word | Qué hay |
| --- | --- |
| **Pruebas de extremo a extremo y de regresión** (diagnóstico, permisos, tareas históricas, notas, reportes) | `npm test` encadena **todas** las baterías (PMV 1, 2 y 3, incluidas las nuevas). Resultado de la última ejecución completa: ver la sección «Ejecución completa» al final. |
| **Medir consumo de IA y voz** | Tabla `consumo_servicios`: una fila por **llamada real** a Gemini (tokens de entrada, salida y total, modelo, origen: lección, borradores de ejercicios, procedimientos, fichas) y por síntesis de voz del servidor (caracteres, proveedor; los aciertos de caché cuentan como coste 0). La lección resuelta por el motor determinista y la repetida desde caché **no** cuentan. Informe para el SUPERADMIN: `GET /api/admin/consumo?dias=30`. |
| Medición realizada (Gemini real) | **Lección**: `gemini-2.5-flash-lite`, **≈ 5 840 tokens por lección** (≈ 4 350 de entrada, de los que ≈ 4 150 son el guion del sistema y van en caché de contexto; ≈ 1 490 de salida), ≈ 3 s. **Borrador de ficha de método**: `gemini-2.5-flash`, ≈ 15 000 tokens (2–3 llamadas: la generación y sus reparaciones). **Voz**: la de la lección es la del navegador, **sin coste de servidor**; no hay proveedor de voz de pago configurado. Datos en `qa/evidencia/consumo-ia-voz.json`. |
| **Identificar la versión por commit** | `GET /api/health` → `"version"`: el commit desplegado (`RENDER_GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA` o `COMMIT`). |
| **Documentar configuración, migraciones, despliegue y reversión** | [`GUIA_OPERACION_PMV3.md`](GUIA_OPERACION_PMV3.md). |
| **Demostración de principio a fin** | `pmv3-piloto` (Chrome real): el docente crea y asigna; el alumno resuelve con el tutor, recibe refuerzo (pistas, repaso en la pizarra con el profesor, equivalente) y completa; el docente consulta la nota y exporta. El profesor de la pizarra es el 3D (o el 2D de respaldo). Guion para hacerlo a mano: [`GUIA_PILOTO_PMV3.md`](GUIA_PILOTO_PMV3.md). |

---

## Límites (con franqueza)

- **Profesor 3D:** el modelo es un robot estilizado de licencia libre (CC0), no un docente humano a medida; cumple lo pedido (esqueleto, expresiones, habla, señala, gestos) y se sustituye por otro GLB sin tocar código si conserva los nombres de huesos y expresiones. La boca usa una expresión del modelo, no visemas fonéticos: se abre con cada palabra que marca la voz.
- **Marcas de voz:** dependen de que el sintetizador del navegador emita `onboundary` (Chrome y Edge sí; algunas voces de sistema no). Sin marcas, la boca se mueve a ritmo mientras suena.
- **Desfase:** medido en Chrome headless con la voz simulada (el `onstart` se dispara a mano); no incluye la latencia del propio altavoz/sintetizador del sistema, que el navegador no expone.
- **Consumo:** sin precios en la aplicación (cambian); el informe da tokens y caracteres, que se multiplican por la tarifa vigente del proveedor. Medición hecha con pocas llamadas: es un orden de magnitud, no una estadística.
- **Habilidades:** el docente las crea y enlaza a mano; no hay un catálogo de habilidades precargado ni una sugerencia automática de prerrequisitos.
- **Tareas en modo «generación en vivo (IA)»:** ni las fichas de método ni las habilidades se aplican ahí; sí en las tareas del banco.
- Este entorno **no es un repositorio git**: la versión local aparece como «desconocido» en `/api/health`; en Render/Vercel sale el commit.

---

## Ejecución completa (27-nov-2026)

- `npx tsc --noEmit`: **0 errores**.
- `npm test`: **33 baterías, las 33 terminan sin fallos** (PMV 1, 2 y 3, incluidas `pmv3-h3a-analogia`, `pmv3-h3b-profesor`, `pmv3-h4-habilidades` y `pmv3-h5b-consumo`), con la app en marcha sin `GEMINI_API_KEY`.
- `pmv3-h5b-consumo` con `QA_CONSUMO_REAL=1` y Gemini real: **14/14**.
- `npm run build` (producción): **compila sin errores**. La pizarra carga 205 kB de JavaScript inicial: three.js y React Three Fiber **no** van en él (se piden bajo demanda).
