# Guía del piloto PMV 3 — recorrido manual en staging

Sirve para que el cliente repita **a mano** lo que automatiza `qa/pmv3-piloto.mjs`. Dura ~15 minutos. Necesitas un navegador Chrome o Edge (el dictado por voz no existe en Firefox).

> **Antes:** aplica las migraciones en la base de **staging** (`npx prisma migrate deploy`) y ejecuta la semilla. No lo hagas sobre producción sin copia de seguridad (ver `ENTREGA_PMV3_HITO1.md`, §5).

Cuentas de la semilla (cámbialas fuera de staging): docente `docente@mentoriamath.local` / `Docente-2026`.

## A. El docente prepara el material (≈ 5 min)

1. **Procedimientos** → tema *Fracciones* → «Qué quieres enseñar»: `Suma de fracciones` → **Generar borrador**. Se rellena el formulario; cada paso muestra *Verificado*.
2. (Opcional) Cambia un paso a algo falso, p. ej. `3/6 + 2/5`, y pulsa **Probar**: el paso queda en rojo con el motivo. Corrígelo.
3. **Vista previa** → prueba la pizarra: **Empezar**, toca un término (`1/2`), **Pausar** y **Reanudar** (el láser se queda y vuelve con el audio), **Pedir una pista**.
4. **Publicar** (el borrador de IA sólo se publica si el servidor lo verificó).
5. **Ejercicios** → *Nuevo ejercicio*: tema *Fracciones*, dificultad *Intermedio*, enunciado `1/2 + 1/3`, añade **3 pistas** («¿Los denominadores son iguales?», «Busca un denominador común», «Amplifica y suma los numeradores») y **Publicado**. Crea también dos parecidos: `1/3 + 1/4` y `1/4 + 1/6`.

## B. Asignar (≈ 2 min)

6. **Aulas** → crea un aula (3.º, sección A) y copia el **código**.
7. **Asignar tarea** → aula, título, fechas, **origen: banco**, y elige **solo** el ejercicio `1/2 + 1/3`.

## C. El alumno (≈ 5 min) — otra ventana de incógnito

8. `/registro` → crea un alumno, completa la **evaluación inicial** (obligatoria).
9. **Unirse** con el código del aula → **Mis tareas** → abre la tarea.
10. Responde mal tres veces (`7/5`, `8/6`, `9/9`):
    - 1.er y 2.º error → aparece **una pista** cada vez (y sigues en el ejercicio).
    - **3.er error** → se abre el **repaso breve**: la pizarra con el profesor 3D. Míralo y pulsa **«He terminado el repaso: volver al ejercicio»**.
11. Responde `5/6` → **correcto**, y aparece **«Para afianzarlo: un ejercicio parecido»**. Resuélvelo (`7/12` o `5/12`, según cuál te toque).
12. La tarea se completa con su nota.

## D. El docente revisa y exporta (≈ 2 min)

13. **Tutoría** → ves al alumno con *Pistas 2 · Repasos 1 · Equivalentes 1 · Bloqueos 1*. Despliega su ejercicio: la historia en orden.
14. **Exportar PDF** y **Exportar Excel**: en el Excel, hoja **«Tutoría adaptativa»** (3 errores, 2 pistas, 1 repaso, 1 equivalente) y las columnas nuevas de «Estudiantes».

## Qué comprobar de seguridad (opcional)

- Con **otro docente**, el alumno y sus informes **no aparecen**; no puede abrir tus procedimientos ni tu banco privado.
- Un alumno **sin aula** no puede usar el tutor ni abrir `/estudiante/pizarra/<id>` de tus procedimientos privados (404).
