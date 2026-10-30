# Contrato que necesita este frontend

Este archivo documenta el contrato compartido entre el frontend y el backend de EventHub.

## URL

`VITE_API_URL=https://eventhub-backend-tbst.onrender.com`

## Eventos

- `GET /eventos`
- `GET /eventos/{id}`
- `POST /eventos`
- `PUT /eventos/{id}` — actualizar un evento
- `DELETE /eventos/{id}` — eliminar un evento y sus subtareas según la regla del backend

Payload de creación:

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
- `PATCH /subtareas/{id}` — actualizar parcialmente una subtarea
- `DELETE /subtareas/{id}` — eliminar una subtarea

Payload:

```json
{
  "evento_id": "uuid-del-evento",
  "titulo": "Preparar presentación",
  "dia_objetivo": "2026-11-28",
  "horas_estimadas": 2,
  "estado": "Pendiente",
  "notas": null
}
```

## Comprobante de imagen (Cloudinary)

Sube una imagen de comprobante (justificante de posposición) para una subtarea. La imagen se almacena en Cloudinary y su URL pública se guarda en la columna `comprobante_url` de la subtarea.

- `POST /subtareas/{subtarea_id}/comprobante` — subir imagen de comprobante

### Parámetros

| Parámetro | Tipo | Ubicación | Descripción |
|-----------|------|-----------|-------------|
| `subtarea_id` | string (UUID) | Path | ID de la subtarea a la que se adjunta el comprobante |
| `file` | archivo (imagen) | Form-data | La imagen del comprobante (JPG, PNG, etc.) |

### Cabeceras

```http
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

> **Importante:** no establishes `Content-Type` manualmente en JavaScript; el navegador lo asigna automáticamente con el `boundary` cuando usas `FormData`.

### Ejemplo de petición (fetch)

```javascript
const formData = new FormData();
formData.append("file", archivoImagen); // archivoImagen es un File de <input type="file">

const respuesta = await fetch(`${VITE_API_URL}/subtareas/${subtareaId}/comprobante`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

### Respuesta exitosa (200 OK)

```json
{
  "message": "Comprobante subido correctamente.",
  "subtarea_id": "uuid-de-la-subtarea",
  "comprobante_url": "https://res.cloudinary.com/tu-cloud-name/image/upload/v1234567890/eventhub/comprobantes/abc123.jpg"
}
```

### Posibles errores

| Código | Significado |
|--------|-------------|
| `401` | Token inválido o expirado |
| `404` | Subtarea no encontrada o no pertenece al usuario autenticado |
| `502` | Error subiendo la imagen a Cloudinary o guardando la URL |

## Vista Hoy y reprogramación

- `GET /hoy` — devuelve gestiones activas agrupadas en `vencidas`, `urgentes` y `proximas`, y el límite diario configurado dentro de `resumen`.
- `PATCH /subtareas/{id}` — el frontend valida la capacidad diaria antes de enviar la reprogramación.

Body de reprogramación:

```json
{
  "dia_objetivo": "2026-11-28",
  "horas_estimadas": 4.5,
  "notas": "Demora en cotización de proveedor"
}
```

El frontend calcula el exceso con las gestiones cargadas desde `GET /hoy` y solo envía `PATCH /subtareas/{id}` cuando la nueva fecha y duración caben en la jornada. La validación es de interfaz; el backend permanece sin cambios.

## Errores

El frontend entiende respuestas con:

```json
{"detail": "Mensaje para el usuario"}
```

## CORS

Permitir el dominio de producción de Vercel y los Preview Deployments de Vercel.

## Edición y eliminación

El frontend abre un formulario modal para editar eventos y subtareas. Para eliminar, primero muestra un modal de confirmación y solamente después ejecuta la petición `DELETE`. Tras una edición o eliminación exitosa, actualiza el estado de React consultando nuevamente el recurso; no hace `window.location.reload()` ni recarga la página completa.

El backend debe exponer `PUT` y `DELETE` en las rutas indicadas para que estas acciones funcionen.
