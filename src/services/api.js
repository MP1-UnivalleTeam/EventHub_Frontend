// Frontend-only API client.
const API_URL = (import.meta.env.VITE_API_URL || "https://eventhub-backend-tbst.onrender.com").replace(/\/$/, "");

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Inténtalo de nuevo.");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const detail = typeof data === "object" && data?.detail ? data.detail : null;
    throw new Error(detail || "No fue posible completar la solicitud.");
  }

  return data;
}

// --- EVENTOS ---

export function obtenerEventos() {
  return request("/eventos");
}

export function obtenerEvento(id) {
  return request(`/eventos/${id}`);
}

export function crearEvento(evento) {
  return request("/eventos", {
    method: "POST",
    body: JSON.stringify(evento),
  });
}

export function actualizarEvento(id, evento) {
  return request(`/eventos/${id}`, {
    method: "PUT",
    body: JSON.stringify(evento),
  });
}

export function actualizarParcialEvento(id, datos) {
  return request(`/eventos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function eliminarEvento(id) {
  return request(`/eventos/${id}`, {
    method: "DELETE",
  });
}

// --- SUBTAREAS ---

export function obtenerSubtareas(eventoId) {
  // Si envías eventoId, lo concatena como query param; si no, trae todas.
  const query = eventoId ? `?evento_id=${encodeURIComponent(eventoId)}` : "";
  return request(`/subtareas/${query}`);
}

export function crearSubtarea(subtarea) {
  return request("/subtareas/", {
    method: "POST",
    body: JSON.stringify(subtarea),
  });
}

export function actualizarSubtarea(id, subtarea) {
  return request(`/subtareas/${id}`, {
    method: "PUT",
    body: JSON.stringify(subtarea),
  });
}

export function actualizarParcialSubtarea(id, datos) {
  return request(`/subtareas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function eliminarSubtarea(id) {
  return request(`/subtareas/${id}`, {
    method: "DELETE",
  });
}
