// Frontend-only API client.
import { obtenerAccessToken } from "./auth.js";
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  let response;

  const token = obtenerAccessToken();
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Inténtalo de nuevo."
    );
  }

  const contentType = response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const detail =
      typeof data === "object" && data?.detail
        ? Array.isArray(data.detail)
          ? data.detail
              .map((item) => item.msg || "Error de validación.")
              .join(" ")
          : String(data.detail)
        : null;

    if (response.status === 401) {
      throw new Error(
        detail || "Tu sesión ha expirado. Inicia sesión nuevamente."
      );
    }

    throw new Error(detail || "No fue posible completar la solicitud.");
  }

  return data;
}

// --- EVENTOS ---

export function obtenerEventos() {
  return request("/eventos/");
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

export function obtenerHoy() {
  return request("/hoy");
}

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

export function subirComprobanteSubtarea(id, archivo) {
  const datos = new FormData();
  datos.append("file", archivo);

  return request(`/subtareas/${id}/comprobante`, {
    method: "POST",
    body: datos,
  });
}

// --- AUTENTICACIÓN ---

export function iniciarSesion(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export function registrarUsuario(datos) {
  return request("/auth/registro", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// --- CONFIGURACIÓN DEL USUARIO ---

export function obtenerConfiguracionUsuario() {
  return request("/usuario/configuracion");
}

export function actualizarConfiguracionUsuario(horasDia) {
  return request("/usuario/configuracion", {
    method: "PUT",
    body: JSON.stringify({
      horas_dia: horasDia,
    }),
  });
}

export function obtenerFotoPerfil() {
  return request("/usuario/foto-perfil", {
    cache: "no-store",
  });
}

export function obtenerPerfilUsuario() {
  return request("/usuario/perfil");
}

export function actualizarPerfilUsuario(perfil) {
  return request("/usuario/perfil", {
    method: "PUT",
    body: JSON.stringify(perfil),
  });
}

export function subirFotoPerfil(archivo) {
  const datos = new FormData();
  datos.append("file", archivo);

  return request("/usuario/foto-perfil", {
    method: "POST",
    body: datos,
  });
}