# Guía de pruebas del PMV 3 — recorrido manual

Esta guía permite comprobar **a mano**, punto por punto, lo que pide el documento PMV3.docx (H1, H2, H3A, H3B, H4, H5A y H5B). Cada apartado dice **qué hacer** y **qué debe verse**. El recorrido completo dura unos **45 minutos**; los apartados se pueden hacer por separado.

## Antes de empezar

- **Navegador:** Chrome o Edge, en ordenador. Para el móvil, ver el apartado 7. El dictado por voz no funciona en Firefox.
- **Dirección:** la del **despliegue de vista previa de Vercel** de la rama de staging (en Vercel → *Deployments*, el último de esa rama).
- **Versión correcta:** abre `<dirección>/api/health`. Debe decir `"status":"ok"` y `"base_datos":"ok"`, y el campo `version` debe coincidir con el último commit entregado. Si el campo `base_datos` no aparece, el servidor todavía sirve una versión antigua.
- **Cuentas** (creadas por la semilla; cámbialas antes de abrir el sistema a usuarios reales):

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Docente | `docente@mentoriamath.local` | `Docente-2026` |
| Dirección | `director@mentoriamath.local` | `Director-2026` |
| Administrador | `admin@mentoriamath.local` | `Admin-2026` |
| Alumno | se crea en `/registro` (apartado 3) | — |

> Consejo: usa una ventana normal para el **docente** y una ventana de **incógnito** para el **alumno**, y así puedes tener las dos sesiones abiertas a la vez.

---

## 1. El docente prepara el material (≈ 12 min)

### 1.1 Bancos de contenido (H1)
1. Entra como docente → **Mis bancos**. Verás el **Catálogo maestro**, común a todos, y **Tu banco**, privado, con los contadores *Publicados*, *Borradores* e *IA por revisar*.
2. **Ejercicios** → *Nuevo ejercicio*:
   - tema *Fracciones*, dificultad *Intermedio*, enunciado `1/2 + 1/3`;
   - añade **3 pistas** («¿Los denominadores son iguales?», «Busca un denominador común», «Amplifica y suma los numeradores»);
   - márcalo **Publicado**.
   
   Crea también `1/3 + 1/4` y `1/4 + 1/6`, que servirán de ejercicios «parecidos».
   - ✅ El ejercicio queda en *Tu banco*, no en el catálogo maestro.

### 1.2 Procedimiento con pizarra, término tocable y analogía (H3A y H5A)
3. **Procedimientos** → tema *Fracciones* → «Qué quieres enseñar»: `Suma de fracciones` → **Generar borrador**.
   - ✅ Se rellena el formulario y cada paso muestra *Verificado*.
4. Cambia un paso por algo falso, por ejemplo `3/6 + 2/5`, y pulsa **Probar**.
   - ✅ El paso queda en rojo con el motivo. Corrígelo después.
5. En un paso, en «Términos», escribe un término (por ejemplo `1/2`), lo que se oye al tocarlo y una **analogía** (por ejemplo «Como media pizza»).
6. **Vista previa** → **Empezar**.
   - ✅ El profesor habla y el **láser** señala cada término mientras lo dice.
   - **Pausar** y **Reanudar**: ✅ el láser se detiene y vuelve con el audio.
   - Toca el término `1/2`: ✅ aparece **«💭 Ver una analogía»**; ábrela y pulsa **«↩ Volver al paso»**.
   - **Pedir una pista**.
7. **Publicar**. Un borrador de IA sólo se publica si el servidor lo verificó.

### 1.3 Ficha de método (H5A)
8. **Métodos** → «Pedir un borrador a la IA» → tema *Fracciones*, método «Suma de fracciones con distinto denominador».
   - ✅ La IA rellena el patrón, las condiciones, los pasos, los ejemplos, las pistas generales y las **pistas de error**.
9. Pulsa **Aprobar y publicar**. Si cambias un paso por algo incorrecto, el servidor no deja publicarlo y explica por qué.

### 1.4 Habilidades y prerrequisitos (H4)
10. **Procedimientos** → crea y publica uno sencillo de tema *Aritmética* llamado «Repaso de signos» (por ejemplo, un paso con `2 - 3 = -1`).
11. **Ejercicios** → crea y publica, en *Ecuaciones lineales*, `2x - 3x = 5` (respuesta −5) y `4x - 6x = 8` (respuesta −4).
12. **Habilidades** → **Nueva habilidad** «Ley de los signos», con **Repaso: Repaso de signos**.
13. Crea otra habilidad, «Reducir términos semejantes», que **Requiere: Ley de los signos**. Enlázale los dos ejercicios de ecuaciones con «Enlazar un ejercicio de tu banco».
14. Prueba a hacer que «Ley de los signos» requiera «Reducir términos semejantes».
    - ✅ Se **rechaza** con un mensaje que explica el ciclo.

---

## 2. Asignar (≈ 3 min)

15. **Aulas** → crea un aula (3.º, sección A) y **copia el código**.
16. **Asignar tarea** → el aula, un título y las fechas → «Elegir ejercicios manualmente» → **sólo** `1/2 + 1/3` → en «Ficha de método» elige la del paso 9.
17. Asigna una **segunda tarea** a la misma aula, con **sólo** `2x - 3x = 5`.
    - ✅ Al asignar, los ejercicios y la ficha quedan **congelados**: si después editas el ejercicio, la tarea no cambia (H1, evaluación segura).

---

## 3. El alumno (≈ 15 min) — en la ventana de incógnito

18. `/registro` → crea un alumno y completa la **evaluación inicial**, que es obligatoria.
19. **Unirse** con el código del aula → **Mis tareas**.

### 3.1 Pistas, repaso, vuelta y ejercicio parecido (H4)
20. Abre la tarea de `1/2 + 1/3`. Responde mal tres veces (`7/5`, `8/6`, `9/9`):
    - ✅ con el 1.er y el 2.º error aparece **una pista** cada vez (y la indicación de la **ficha de método**);
    - ✅ con el **3.er error** se abre el **repaso breve**, la pizarra con el profesor. Míralo y pulsa **«He terminado el repaso: volver al ejercicio»**.
21. Responde `5/6`.
    - ✅ Sale **correcto** y aparece **«Para afianzarlo: un ejercicio parecido»**. Resuélvelo (`7/12` o `5/12`, según el que toque).
22. Abre la tarea de `2x - 3x = 5`. Responde `5` tres veces.
    - ✅ Dos pistas y, al tercer error, el repaso **«Repaso de signos»**: el del **prerrequisito**, no el del tema.
    - Vuelve, responde `-5`.
    - ✅ Te propone `4x - 6x = 8`; responde `-4`.
    - ✅ La tarea se completa con su nota, calculada en el servidor.

### 3.2 Profesor 3D y pizarra (H3A y H3B)
23. Abre la pizarra de un procedimiento publicado, por ejemplo desde el repaso o desde **Practicar métodos**.
    - ✅ Aparece el **profesor 3D**: habla y mueve la boca, **señala con el brazo** y con un rayo el término que está diciendo, pregunta, espera tu respuesta y da pistas.
24. Pulsa **«Ver profesor en 2D»**.
    - ✅ Hace lo mismo en 2D.
    - ✅ La preferencia se recuerda al recargar la página. **«Ver profesor en 3D»** la devuelve.
25. Pulsa **«🎤 Responder hablando»** y di la respuesta.
    - ✅ Aparece «Entendí «…»». Puedes **corregir** el texto antes de pulsar **Responder**.

### 3.3 Práctica guiada paso a paso (H2)
26. Panel del alumno → **Practicar paso a paso** → ecuación `2(x+4) = 3x-1`.
    - Escribe `2x+8 = 3x-1`: ✅ se **acepta**.
    - Escribe `2x+4 = 3x-1`: ✅ se **rechaza** y el tutor explica el error (no se ha multiplicado el 4).
    - ✅ Sigue hasta *¡Resuelta!*: la solución no se revela antes de tiempo.

---

## 4. El docente revisa y exporta (≈ 5 min)

27. **Tutoría**:
    - ✅ ves al alumno con sus pistas, repasos, ejercicios parecidos y bloqueos. Despliega un ejercicio y verás la historia en orden;
    - ✅ en la tabla **«Por habilidad»**, «Reducir términos semejantes» tiene 4 intentos, 3 errores, 1 acierto, 2 pistas y 1 repaso;
    - usa el **filtro por aula**.
28. **Exportar PDF** y **Exportar Excel**, con el mismo filtro.
    - ✅ Las cifras coinciden con el panel.
    - ✅ El Excel tiene las hojas **«Tutoría adaptativa»** y **«Habilidades»**.

---

## 5. Seguridad (opcional, ≈ 3 min)

- Registra **otro docente**: no ve a tu alumno ni sus informes, ni tus procedimientos, fichas, habilidades o banco privado.
- Un alumno **sin aula** no puede usar el tutor ni abrir `/estudiante/pizarra/<id>` de un procedimiento privado (página 404).
- En una tarea de evaluación, el alumno no puede ver las respuestas ni cambiar su nota.

## 6. Consumo de IA y voz (H5B, ≈ 2 min)

29. Entra como **administrador** y abre `<dirección>/api/admin/consumo?dias=30`.
    - ✅ Hay una fila por servicio (IA y voz), con el número de llamadas, los tokens y los fallos. Las llamadas de los pasos 3 y 8 aparecen ahí.
    - Con otra cuenta, esa dirección responde **403**.

## 7. En el móvil o la tableta (≈ 3 min)

30. Repite los pasos 23 y 24 desde un teléfono.
    - ✅ La pizarra se adapta a la pantalla y el láser sigue señalando el término correcto al girar el teléfono.
    - ✅ Si el teléfono no tiene WebGL, el profesor sale en 2D automáticamente.

---

## Qué anotar si algo falla

Para cada fallo: el **número de paso**, qué esperabas, qué pasó, el navegador y el dispositivo, y si es posible una captura de pantalla. Añade también el `version` que muestra `/api/health`.

## Límites conocidos de esta entrega

- El profesor 3D es un **robot estilizado** de licencia libre (CC0), no un personaje humano hecho a medida. La boca se abre con cada palabra, pero no dibuja la forma exacta de cada sonido.
- Las tareas de **generación en vivo (IA)** no usan fichas de método ni habilidades; las tareas del **banco**, sí.
- Las cifras de consumo de IA salen de pocas llamadas reales: son un orden de magnitud, no una media.
