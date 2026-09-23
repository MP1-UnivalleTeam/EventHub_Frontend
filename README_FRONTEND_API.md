# Contrato que necesita este frontend

Este archivo documenta únicamente lo que el frontend espera del backend. No modifica ni contiene código de backend.

## URL

`VITE_API_URL=https://eventhub-backend-tbst.onrender.com`

## Eventos

- `GET /eventos`
- `GET /eventos/{id}`
- `POST /eventos`
- `PUT /eventos/{id}` — actualizar un evento
- `DELETE /eventos/{id}` — eliminar un evento y sus subtareas según la regla del backend

Payload de creación esperado por el frontend:

```json
{
  "titulo": "Conferencia de Tecnología 2026",
  "fecha": "2026-09-25",
  "horas": 4,
  "usuario_responsable": "Laura V.",
  "descripcion": "Descripción del evento"
}
```

## Subtareas

- `GET /subtareas/?evento_id={id}`
- `POST /subtareas/`
- `PUT /subtareas/{id}` — actualizar una subtarea
- `DELETE /subtareas/{id}` — eliminar una subtarea

Payload:

```json
{
  "evento_id": 15,
  "nombre": "Preparar presentación",
  "horas": 2,
  "estado": "Pendiente"
}
```

## Errores

El frontend entiende respuestas con:

```json
{"detail": "Mensaje para el usuario"}
```

## CORS

Permitir el dominio de producción de Vercel y los Preview Deployments de Vercel.

## Nota

El frontend no contiene cambios de backend. Si los nombres de campos o rutas reales son diferentes, el compañero encargado del backend puede adaptar el contrato o indicar el cambio para ajustar `src/services/api.js`.

## Edición y eliminación

El frontend abre un formulario modal para editar eventos y subtareas. Para eliminar, primero muestra un modal de confirmación y solamente después ejecuta la petición `DELETE`. Tras una edición o eliminación exitosa, actualiza el estado de React consultando nuevamente el recurso; no hace `window.location.reload()` ni recarga la página completa.

El backend debe exponer `PUT` y `DELETE` en las rutas indicadas para que estas acciones funcionen.
