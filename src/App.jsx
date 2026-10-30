import "./App.css";
import logo_EventHub from "./assets/Logo.png";
import logo_Jaguar from "./assets/Logo_Jaguar.png";
import logo_Blanco from "./assets/LogoBlanco.png";
import {
  FaLock,
  FaEye,
  FaEyeSlash,
  FaDoorOpen,
  FaSyncAlt,
  FaTrashAlt,
  FaFilter,
  FaCalendarAlt,
  FaTasks,
  FaUser,
  FaRegFileAlt,
  FaChevronDown,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaChevronLeft,
  FaChevronRight,
  FaTimes,
  FaImage,
  FaPaperclip,
  FaChartLine,
} from "react-icons/fa";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  actualizarEvento,
  actualizarSubtarea,
  actualizarPerfilUsuario,
  actualizarConfiguracionUsuario,
  crearEvento,
  crearSubtarea,
  eliminarEvento,
  eliminarSubtarea,
  iniciarSesion,
  registrarUsuario,
  obtenerConfiguracionUsuario,
  obtenerFotoPerfil,
  obtenerPerfilUsuario,
  obtenerHoy,
  obtenerEvento,
  obtenerEventos,
  obtenerSubtareas,
  actualizarParcialSubtarea,
  subirFotoPerfil,
  subirComprobanteSubtarea,
} from "./services/api.js";
import {
  cerrarSesion,
  estaAutenticado,
  guardarSesion,
  obtenerSesion,
} from "./services/auth.js";



function obtenerDatosPerfil() {
  const usuario = obtenerSesion()?.usuario || {};
  const nombre =
    [usuario.nombre, usuario.apellido].filter(Boolean).join(" ").trim() ||
    usuario.nombre_completo ||
    usuario.full_name ||
    usuario.name ||
    "Organizador";
  const correo =
    usuario.email ||
    usuario.correo ||
    usuario.correo_electronico ||
    usuario.username ||
    "";
  const iniciales = String(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toLocaleUpperCase("es-CO") || "")
    .join("") || "EH";
  return { nombre: String(nombre), correo: String(correo), iniciales };
}

const rutas = ["/login", "/registro", "/registro/onboarding", "/eventos", "/hoy", "/progreso", "/crear-evento", "/configuracion"];

// Deshabilita temporalmente el paso de "Personalización de tu espacio de
// trabajo." durante este sprint. El componente OnboardingRegistro y sus
// categorías se conservan intactos; basta con volver a poner esta bandera en
// true para rehabilitar la pantalla.
const PERSONALIZACION_HABILITADA = false;

function rutaActual() {
  const path = window.location.pathname;
  if (path.startsWith("/eventos/") && path.split("/")[2]) return path;
  if (path === "/registro/onboarding" && !PERSONALIZACION_HABILITADA) {
    return "/eventos";
  }
  return rutas.includes(path) ? path : "/eventos";
}
function esRutaPublica(path) {
  return path === "/login" || path === "/registro";
}
function esRutaPrivada(path) {
  return (
    path === "/eventos" ||
    path === "/hoy" ||
    path === "/crear-evento" ||
    path === "/configuracion" ||
    path === "/progreso" ||
    path === "/registro/onboarding" ||
    path.startsWith("/eventos/")
  );
}
function obtenerRutaInicial() {
  const path = window.location.pathname;

  if (esRutaPublica(path)) {
    return estaAutenticado() ? "/eventos" : path;
  }

  if (esRutaPrivada(path)) {
    return estaAutenticado() ? rutaActual() : "/login";
  }

  return estaAutenticado() ? "/eventos" : "/login";
}

function navegar(path) {
  if (path === "/registro/onboarding" && !PERSONALIZACION_HABILITADA) {
    path = "/eventos";
  }

  if (esRutaPrivada(path) && !estaAutenticado()) {
    path = "/login";
  }

  if (
    path === "/login" &&
    estaAutenticado()
  ) {
    path = "/eventos";
  }

  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }

  window.dispatchEvent(
    new PopStateEvent("popstate", { state: { eventhubInternalNavigation: true } })
  );
}

function formatearFecha(fecha) {
  if (!fecha) return "Sin fecha";
  const [y, m, d] = String(fecha).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d));
}

function normalizarEstado(estado) {
  const value = String(estado || "pendiente").trim().toLowerCase();
  if (value === "hecho" || value === "hecha" || value.includes("complet")) return "hecho";
  if (value === "pospuesto") return "pospuesto";
  return "pendiente";
}

function etiquetaEstado(estado) {
  const value = normalizarEstado(estado);
  if (value === "hecho") return "Hecho";
  if (value === "pospuesto") return "Pospuesto";
  return "Pendiente";
}

// "Vencida" no se puede marcar: es un estado calculado a partir de la fecha
// de gestión (ver `estadoEfectivoSubtarea`).
const ESTADOS_EDITABLES = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "hecho", etiqueta: "Hecho" },
  { valor: "pospuesto", etiqueta: "Pospuesto" },
];

// "Vencida" es una etiqueta derivada, no un valor de la columna `estado`
// (que solo admite pendiente/pospuesto/hecho). Al guardar se traduce a
// "pendiente": es el estado real de una gestión cuya fecha objetivo pasó.
function normalizarEstadoAGuardar(estado) {
  const valor = String(estado || "pendiente").trim().toLowerCase();

  return valor === "vencida" || valor === "vencido" ? "pendiente" : valor;
}

// Fecha de gestión de la subtarea en formato YYYY-MM-DD. Se lee siempre del
// texto porque las fechas se guardan como `YYYY-MM-DD`: pasarlas por
// `new Date()` las desplazaría un día al convertirlas a UTC.
function obtenerFechaObjetivo(subtarea) {
  const fecha = subtarea?.dia_objetivo || subtarea?.fechaObjetivo || "";

  return String(fecha).slice(0, 10);
}

// Estado efectivo de la subtarea: regla única que comparten /hoy,
// /eventos/:id y /progreso para que las tres vistas muestren lo mismo.
function estadoEfectivoSubtarea(
  subtarea,
  hoy = obtenerFechaLocalHoy()
) {
  const estado = normalizarEstado(subtarea?.estado);

  if (estado === "hecho") return "hecho";

  // Solo queda atrás cuando la fecha es ANTERIOR al día actual: una gestión
  // con fecha límite de hoy todavía está vigente. La fecha usada es la
  // vigente, es decir la reprogramada cuando la subtarea está pospuesta.
  const fecha = obtenerFechaObjetivo(subtarea);
  if (fecha && fecha < hoy) return "vencido";

  if (estado === "pospuesto") return "pospuesto";

  return "pendiente";
}

function estaVencida(subtarea, hoy = obtenerFechaLocalHoy()) {
  return estadoEfectivoSubtarea(subtarea, hoy) === "vencido";
}

// Clave de clase CSS para el distintivo de estado del detalle del evento.
function claveBadgeEstado(subtarea) {
  const estado = estadoEfectivoSubtarea(subtarea);

  if (estado === "hecho") return "badge-success";
  if (estado === "pospuesto") return "badge-pospuesto";
  if (estado === "vencido") return "badge-danger";

  return "badge-pending";
}

// Texto del distintivo: la vencimiento reemplaza a "Pendiente" porque es
// la información accionable para el organizador.
function etiquetaBadgeEstado(subtarea) {
  const estado = estadoEfectivoSubtarea(subtarea);

  if (estado === "hecho") return "Hecho";
  if (estado === "pospuesto") return "Pospuesto";
  if (estado === "vencido") return "Vencida";

  return "Pendiente";
}

function normalizarNota(valor) {
  if (valor === null || valor === undefined) return "";

  return String(valor).trim();
}

function obtenerNotaSubtarea(subtarea) {
  const canonica = normalizarNota(subtarea?.notas);
  if (canonica) return canonica;

  // `GET /hoy` entrega la nota ya resuelta en este campo.
  return normalizarNota(subtarea?.nota);
}

function obtenerResponsableSubtarea(subtarea) {
  const valor =
    subtarea?.responsable ??
    subtarea?.responsable_nombre ??
    subtarea?.nombre_responsable ??
    subtarea?.usuario_responsable ??
    subtarea?.asignado_a ??
    "";

  if (valor && typeof valor === "object") {
    return String(valor.nombre ?? valor.nombre_completo ?? valor.email ?? "");
  }

  return normalizarNota(valor);
}

function obtenerHoras(item) {
  const value = Number(item?.horas_estimadas ?? item?.horas ?? item?.hours ?? 0);
  return Number.isFinite(value) ? minutosAHoras(horasAMinutos(value)) : 0;
}

function horasAMinutos(valor) {
  const horas = Number(valor);
  return Number.isFinite(horas)
    ? Math.max(0, Math.round(horas * 60 + Number.EPSILON))
    : 0;
}

function minutosAHoras(minutos) {
  const total = Number(minutos);
  return Number.isFinite(total)
    ? Number((Math.max(0, Math.trunc(total)) / 60).toFixed(10))
    : 0;
}

function sumarMinutosEstimados(items) {
  return items.reduce((total, item) => total + horasAMinutos(obtenerHoras(item)), 0);
}

function formatearDuracion(valor) {
  const minutosTotales = horasAMinutos(valor);
  if (minutosTotales === 0) return "0min";
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  if (horas && minutos) return `${horas}h ${minutos}min`;
  if (horas) return `${horas}h`;
  return `${minutos}min`;
}

function DurationInput({
  id,
  name,
  value,
  onChange,
  disabled = false,
  ariaInvalid = false,
  maxHours = 24,
}) {
  const tieneValor = value !== "" && value !== null && value !== undefined &&
    Number.isFinite(Number(value));
  const minutosTotales = tieneValor ? horasAMinutos(value) : 0;
  const horasParte = tieneValor && minutosTotales >= 60
    ? String(Math.floor(minutosTotales / 60))
    : "";
  const minutosRestantes = minutosTotales % 60;
  const minutosParte = tieneValor && minutosRestantes > 0
    ? String(minutosRestantes)
    : "";

  const actualizarParte = (parte, valorCrudo) => {
    let horas = parte === "horas"
      ? (valorCrudo === "" ? 0 : Number(valorCrudo))
      : (horasParte === "" ? 0 : Number(horasParte));
    let minutos = parte === "minutos"
      ? (valorCrudo === "" ? 0 : Number(valorCrudo))
      : (minutosParte === "" ? 0 : Number(minutosParte));

    horas = Math.max(0, Math.min(maxHours, Number.isFinite(horas) ? horas : 0));
    minutos = Math.max(0, Math.min(59, Number.isFinite(minutos) ? minutos : 0));
    if (horas >= maxHours) minutos = 0;

    const totalMinutos = horas * 60 + minutos;
    const nuevoValor = totalMinutos === 0 ? "" : String(minutosAHoras(totalMinutos));

    onChange({ target: { name, value: nuevoValor } });
  };

  return (
    <div className="duration-input" aria-invalid={ariaInvalid || undefined}>
      <div className="duration-input-part">
        <label htmlFor={`${id}-hours`}>Horas</label>
        <input
          id={`${id}-hours`}
          name={`${name}_horas`}
          type="number"
          min="0"
          max={maxHours}
          step="1"
          inputMode="numeric"
          value={horasParte}
          onChange={(event) => actualizarParte("horas", event.target.value)}
          disabled={disabled}
          aria-invalid={ariaInvalid}
        />
      </div>
      <span className="duration-input-separator" aria-hidden="true">:</span>
      <div className="duration-input-part">
        <label htmlFor={`${id}-minutes`}>Minutos</label>
        <input
          id={`${id}-minutes`}
          name={`${name}_minutos`}
          type="number"
          min="0"
          max="59"
          step="1"
          inputMode="numeric"
          value={minutosParte}
          onChange={(event) => actualizarParte("minutos", event.target.value)}
          disabled={disabled}
          aria-invalid={ariaInvalid}
        />
      </div>
    </div>
  );
}

function obtenerHorasPendientes(tareas) {
  const minutos = tareas
    .filter((tarea) => {
      const estado = normalizarEstado(tarea.estado);
      return estado === "pendiente" || estado === "pospuesto";
    })
    .reduce((total, tarea) => total + horasAMinutos(obtenerHoras(tarea)), 0);
  return minutosAHoras(minutos);
}

function obtenerTituloSubtarea(item) {
  return item?.titulo ?? item?.nombre ?? "Sin título";
}

function limitarFechaSubtarea(fecha, fechaEvento) {
  const hoy = obtenerFechaLocalHoy();
  const maximo = String(fechaEvento || "").slice(0, 10);
  if (!maximo || maximo < hoy) return "";

  const seleccionada = String(fecha || "").slice(0, 10);
  if (!seleccionada || seleccionada < hoy || seleccionada > maximo) {
    return maximo;
  }
  return seleccionada;
}

// Sin fecha seleccionada, limitarFechaSubtarea devuelve el límite superior del
// evento padre, o "" si el evento ya se venció o no tiene fecha utilizable.
function obtenerFechaLimiteSubtarea(fechaEvento) {
  return limitarFechaSubtarea("", fechaEvento);
}

// El día objetivo debe quedar entre hoy y la fecha del evento padre; con el
// evento ya vencido ninguna fecha es admisible.
function esFechaSubtareaValida(fecha, fechaEvento) {
  const limite = limitarFechaSubtarea(fecha, fechaEvento);
  return Boolean(limite) && limite === String(fecha || "").slice(0, 10);
}

function construirConflictoSobrecarga({
  agenda,
  fecha,
  horas,
  capacidadDiaria,
  excluirId,
  fechaLimite,
  titulo,
  eventoTitulo,
  subtareasNuevas = [],
  idSubtareaCausa,
}) {
  const horasOtros = agenda.reduce((total, subtarea) => {
    if (
      String(subtarea.fechaObjetivo || "").slice(0, 10) !== fecha ||
      String(subtarea.id) === String(excluirId)
    ) {
      return total;
    }
    return total + obtenerHoras(subtarea);
  }, 0);
  const nuevasDelDia = subtareasNuevas.filter(
    (nueva) => String(nueva.fechaObjetivo || "").slice(0, 10) === fecha
  );
  const horasNuevas = nuevasDelDia.reduce(
    (total, nueva) => total + obtenerHoras(nueva),
    0
  );
  const horasTotales = horasOtros + horasNuevas + Number(horas);

  if (horasTotales <= capacidadDiaria) {
    return null;
  }

  const detalle = agenda
    .filter(
      (subtarea) =>
        String(subtarea.fechaObjetivo || "").slice(0, 10) === fecha &&
        String(subtarea.id) !== String(excluirId)
    )
    .map((subtarea) => ({
      id: subtarea.id,
      titulo: obtenerTituloSubtarea(subtarea),
      evento: subtarea.evento?.titulo || subtarea.evento_titulo || subtarea.titulo_evento || "Evento sin título",
      horas_estimadas: obtenerHoras(subtarea),
      es_subtarea_reprogramada: false,
    }));

  nuevasDelDia.forEach((nueva, indice) => {
    detalle.push({
      id: nueva.id ?? `subtarea-nueva-${indice}`,
      titulo: obtenerTituloSubtarea(nueva),
      evento: eventoTitulo || "Evento sin título",
      horas_estimadas: obtenerHoras(nueva),
      es_subtarea_reprogramada: true,
    });
  });

  detalle.push({
    id: excluirId ?? "subtarea-nueva",
    titulo,
    evento: eventoTitulo || "Evento sin título",
    horas_estimadas: Number(horas),
    es_subtarea_reprogramada: true,
  });

  const fechaBase = new Date(`${fecha}T00:00:00`);
  const fechasFuturas = [];

  for (let dias = 1; dias <= 365; dias += 1) {
    const candidata = new Date(fechaBase);
    candidata.setDate(candidata.getDate() + dias);
    const fechaCandidata = [
      candidata.getFullYear(),
      String(candidata.getMonth() + 1).padStart(2, "0"),
      String(candidata.getDate()).padStart(2, "0"),
    ].join("-");

    if (fechaLimite && fechaCandidata > fechaLimite) {
      break;
    }

    const horasCandidata =
      agenda.reduce(
        (total, subtarea) =>
          String(subtarea.fechaObjetivo || "").slice(0, 10) ===
            fechaCandidata &&
          String(subtarea.id) !== String(excluirId)
            ? total + obtenerHoras(subtarea)
            : total,
        0
      ) +
      nuevasDelDia.reduce(
        (total, nueva) =>
          String(nueva.fechaObjetivo || "").slice(0, 10) === fechaCandidata
            ? total + obtenerHoras(nueva)
            : total,
        0
      );

    fechasFuturas.push({
      fecha: fechaCandidata,
      horasAsignadas: horasCandidata,
    });
  }

  const horasCausa = Number(horas) || 0;
  const horasConCapacidad = fechasFuturas.filter(
    (candidata) =>
      candidata.horasAsignadas + horasCausa <= capacidadDiaria
  );
  const fechasParaRecomendar = horasConCapacidad.length
    ? horasConCapacidad
    : fechasFuturas;
  const recomendada = fechasParaRecomendar.length
    ? fechasParaRecomendar.reduce(
        (menosCargada, candidata) =>
          candidata.horasAsignadas < menosCargada.horasAsignadas
            ? candidata
            : menosCargada
      )
    : null;
  const fechaRecomendada = recomendada?.fecha;
  // Carga del día origen y del día recomendado, ambas sin contar la subtarea
  // causante: son las bases que el modal necesita para recalcular en vivo la
  // jornada que quedaría tras aplicar cada solución.
  const horasOtras = horasOtros + horasNuevas;

  return {
    limite_excedido: true,
    fecha_objetivo: fecha,
    horas_asignadas: horasTotales,
    limite_horas: capacidadDiaria,
    exceso_horas: horasTotales - capacidadDiaria,
    horas_disponibles: Math.max(0, capacidadDiaria - horasOtras),
    horas_causa: horasCausa,
    horas_otras: horasOtras,
    horas_recomendadas: recomendada?.horasAsignadas ?? 0,
    agenda: detalle,
    fecha_recomendada: fechaRecomendada,
    id_subtarea_causa: idSubtareaCausa,
  };
}

// La agenda de origen se levanta en varios puntos del flujo; este respaldo
// reconstruye la carga ajena a la causa cuando el conflicto no la expone.
function obtenerHorasAjenas(conflicto) {
  const limite = Number(conflicto?.limite_horas) || 0;
  const declaradas = Number(conflicto?.horas_otras);

  if (Number.isFinite(declaradas)) {
    return declaradas;
  }

  const agenda = Array.isArray(conflicto?.agenda) ? conflicto.agenda : [];
  const detalle = agenda.reduce(
    (total, item) => total + (Number(item?.horas_estimadas) || 0),
    0
  );
  const horasCausa = Number(conflicto?.horas_causa);

  if (Number.isFinite(horasCausa)) {
    return Math.max(0, detalle - horasCausa);
  }

  return Math.max(0, limite - (Number(conflicto?.horas_disponibles) || 0));
}

const PASO_HORAS_MANUALES = 0.5;

// Suma de horas con decimales; la tolerancia evita que 0.1 + 0.2 descarte una
// solución que en realidad cabe en la jornada.
function cabeEnJornada(horas, limite) {
  return horas - limite <= 1e-9;
}

function redondearHoras(horas) {
  return Math.round((Number(horas) || 0) * 60) / 60;
}

// Duración con la que arranca el control manual: la mayor que quepa en la
// jornada, acotada al rango que el selector de +/- puede representar.
function calcularHorasManualesIniciales(conflicto, horasCausa) {
  const limite = Number(conflicto?.limite_horas) || 0;
  const presupuesto = Math.max(0, limite - obtenerHorasAjenas(conflicto));
  const causa = Number(horasCausa) || 0;
  const sugerida = Math.min(causa || presupuesto, presupuesto, limite);

  return redondearHoras(Math.max(PASO_HORAS_MANUALES, sugerida));
}

// Fuente única de verdad del modal: a partir del conflicto, la estrategia y la
// duración manual devuelve en un solo objeto la carga, el tope, el exceso, la
// disponibilidad y la validez. La tarjeta, la alerta y el botón se alimentan
// de aquí para que nunca muestren cifras contradictorias ni se queden obsoletas.
function calcularResolucionSobrecarga({
  conflicto,
  estrategia,
  horasManuales,
  horasCausa,
}) {
  const limite = Number(conflicto?.limite_horas) || 0;
  const causa = Math.max(0, Number(horasCausa) || 0);
  const horasAjustadas = Math.max(0, Number(horasManuales) || 0);
  const mover = estrategia === "mover" && Boolean(conflicto?.fecha_recomendada);

  // Cada estrategia tiene su propio día destino y su propia carga previa.
  const fechaDestino = mover
    ? conflicto.fecha_recomendada
    : conflicto?.fecha_objetivo;
  const cargaPrevia = mover
    ? Math.max(0, Number(conflicto?.horas_recomendadas) || 0)
    : obtenerHorasAjenas(conflicto);
  const horasAplicadas = mover ? causa : redondearHoras(horasAjustadas);
  const asignadas = cargaPrevia + horasAplicadas;

  // Lo que la causa puede ocupar ese día sin desbordar el tope, y lo que queda
  // libre una vez aplicada la solución (puede ser negativo si hay sobrecarga).
  const presupuesto = Math.max(0, limite - cargaPrevia);
  const restante = limite - asignadas;
  const exceso = Math.max(0, asignadas - limite);

  let alerta = null;

  if (mover) {
    if (!cabeEnJornada(asignadas, limite)) {
      alerta = {
        tipo: "mover",
        horas: asignadas,
        limite,
      };
    }
  } else if (!cabeEnJornada(asignadas, limite)) {
    alerta = {
      tipo: presupuesto < PASO_HORAS_MANUALES ? "sin-hueco" : "excede",
      horas: presupuesto,
      limite,
    };
  }

  return {
    estrategia: mover ? "mover" : "manual",
    fecha_destino: fechaDestino,
    limite,
    horas_causa: causa,
    horas_aplicadas: horasAplicadas,
    carga_previa: cargaPrevia,
    asignadas,
    exceso,
    restante,
    presupuesto,
    disponible: Math.max(0, restante),
    alerta,
    valido: !alerta && horasAplicadas > 0,
  };
}

// Traduce el motivo de bloqueo a la alerta que ya existe en el modal, usando
// siempre las cifras del cálculo vigente.
function resolverMensajeAlerta(resolucionActual) {
  const alerta = resolucionActual.alerta;

  if (!alerta) return null;

  if (alerta.tipo === "mover") {
    return (
      <>
        ⚠ El {formatearFecha(resolucionActual.fecha_destino)} también
        superaría su jornada ({formatearDuracion(alerta.horas)} de{" "}
        {formatearDuracion(alerta.limite)}). Ajusta la duración manualmente para
        continuar.
      </>
    );
  }

  if (alerta.tipo === "sin-hueco") {
    return (
      <>
        ⚠ El {formatearFecha(resolucionActual.fecha_destino)} ya tiene{" "}
        {formatearDuracion(resolucionActual.carga_previa)} programadas y solo admite{" "}
        {formatearDuracion(alerta.horas)}. Mueve la gestión a otro día para
        continuar.
      </>
    );
  }

  return (
    <>
      ⚠ La duración supera los {formatearDuracion(alerta.horas)} disponibles.
      Disminuye la duración para continuar.
    </>
  );
}

function prepararNuevasParaConflicto(subtareasNuevas, fechaActual, fechaEvento) {
  return subtareasNuevas.map((nueva) => ({
    ...nueva,
    titulo: String(nueva.titulo || "").trim(),
    fechaObjetivo: limitarFechaSubtarea(
      nueva.dia_objetivo || fechaActual,
      fechaEvento
    ),
  }));
}

function buscarConflictoSubtareasNuevas({
  agenda,
  subtareasNuevas,
  capacidadDiaria,
  eventoTitulo,
  fechaLimite,
}) {
  const nuevasPorFecha = new Map();

  subtareasNuevas.forEach((subtarea) => {
    if (
      !subtarea.fechaObjetivo ||
      normalizarEstado(subtarea.estado) === "hecho"
    ) {
      return;
    }

    const fecha = String(subtarea.fechaObjetivo).slice(0, 10);
    nuevasPorFecha.set(fecha, [
      ...(nuevasPorFecha.get(fecha) || []),
      subtarea,
    ]);
  });

  for (const [fecha, subtareasDelDia] of nuevasPorFecha) {
    const subtareaCausa = subtareasDelDia[subtareasDelDia.length - 1];
    const conflicto = construirConflictoSobrecarga({
      agenda,
      fecha,
      horas: obtenerHoras(subtareaCausa),
      capacidadDiaria,
      titulo: subtareaCausa.titulo,
      eventoTitulo,
      fechaLimite,
      subtareasNuevas: subtareasDelDia.slice(0, -1),
      idSubtareaCausa: subtareaCausa.id,
    });

    if (conflicto) {
      return conflicto;
    }
  }

  return null;
}

function Toast({ type = "success", message }) {
  if (!message) return null;
  // Se monta en el body para que ningún overlay, modal o contexto de
  // apilamiento del árbol de la aplicación pueda tapar el mensaje.
  return createPortal(
    <div className={`toast toast-${type}`} role={type === "error" ? "alert" : "status"}>{type === "success" ? "✓" : "!"} {message}</div>,
    document.body,
  );
}

function Modal({ title, subtitle, close, children, wide = false }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeRef} className="close" type="button" aria-label="Cerrar" onClick={close}>×</button>
        <h2 id="modal-title">{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}

// Menú compartido por el botón «+ Crear» de la cabecera y el botón flotante
// móvil. Solo contiene las dos acciones de creación que ya existen en EventHub.
function CreateMenu({
  id,
  abierto = true,
  onCrearEvento,
  onCrearSubtarea,
  variant = "header",
}) {
  return (
    <div
      id={id}
      className={`create-menu create-menu--${variant}${abierto ? " is-open" : ""}`}
      role="menu"
      aria-label="Opciones de creación"
      aria-hidden={!abierto}
      inert={!abierto}
    >
      <button
        className="create-menu-item"
        type="button"
        role="menuitem"
        onClick={onCrearEvento}
      >
        <span className="create-menu-item-icon" aria-hidden="true">
          <FaCalendarAlt />
        </span>
        <span className="create-menu-item-copy">
          <strong>Crear Evento</strong>
          <small>Planifica un nuevo evento</small>
        </span>
      </button>

      <button
        className="create-menu-item"
        type="button"
        role="menuitem"
        onClick={onCrearSubtarea}
      >
        <span className="create-menu-item-icon" aria-hidden="true">
          <FaTasks />
        </span>
        <span className="create-menu-item-copy">
          <strong>Crear Subtarea</strong>
          <small>Añádela a uno de tus eventos</small>
        </span>
      </button>
    </div>
  );
}

// Sección opcional compartida; conserva los valores al animar su apertura.
function StitchOptionalSection({
  id,
  icon,
  title,
  children,
  defaultOpen = false,
  className = "",
}) {
  const [abierta, setAbierta] = useState(defaultOpen);
  const toggleRef = useRef(null);

  const alternar = () => {
    // Si el foco está dentro del panel, lo devolvemos al disparador para no
    // dejar el foco en un elemento inerte al cerrar la sección.
    const panel = document.getElementById(`${id}-panel`);
    if (abierta && panel?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
    setAbierta((valor) => !valor);
  };

  return (
    <section
      className={`stitch-optional-section stitch-optional-collapsible${abierta ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={toggleRef}
        className="stitch-optional-toggle"
        type="button"
        aria-expanded={abierta}
        aria-controls={`${id}-panel`}
        onClick={alternar}
      >
        <span className="stitch-optional-icon" aria-hidden="true">{icon}</span>
        <span className="stitch-optional-heading">
          <strong>{title}</strong>
          <span className="stitch-optional-hint">(opcional)</span>
        </span>
        <span className="stitch-optional-chevron" aria-hidden="true">
          <FaChevronDown />
        </span>
      </button>

      <div
        className="stitch-optional-panel"
        id={`${id}-panel`}
        role="region"
        aria-label={title}
        inert={!abierta}
      >
        <div className="stitch-optional-panel-inner">{children}</div>
      </div>
    </section>
  );
}

function ResponsibleCombobox({ id, value, options, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const opcionesFiltradas = options.filter((nombre) =>
    nombre.toLocaleLowerCase("es").includes(value.trim().toLocaleLowerCase("es"))
  );

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarFuera = (event) => {
      if (!containerRef.current?.contains(event.target)) setAbierto(false);
    };
    const cerrarEscape = (event) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [abierto]);

  return (
    <div className="responsible-combobox" ref={containerRef}>
      <div className="responsible-combobox-control">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={abierto && opcionesFiltradas.length > 0}
          aria-controls={abierto && opcionesFiltradas.length > 0 ? `${id}-options` : undefined}
          autoComplete="off"
          maxLength={150}
          value={value}
          onFocus={() => setAbierto(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setAbierto(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!abierto) setAbierto(true);
              else listRef.current?.querySelector("button")?.focus();
            } else if (event.key === "Escape") {
              setAbierto(false);
            }
          }}
          placeholder="Busca o escribe un nombre"
        />
        {value && (
          <button
            type="button"
            className="responsible-combobox-clear"
            aria-label="Quitar responsable"
            onClick={() => {
              onChange("");
              setAbierto(false);
            }}
          >
            ×
          </button>
        )}
      </div>
      {abierto && opcionesFiltradas.length > 0 && (
        <div
          className="responsible-combobox-options"
          id={`${id}-options`}
          role="listbox"
          aria-label="Responsables existentes"
          ref={listRef}
        >
          {opcionesFiltradas.map((nombre) => (
            <button
              key={nombre}
              type="button"
              role="option"
              aria-selected={value === nombre}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(nombre);
                setAbierto(false);
              }}
            >
              {nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  ruta,
  abrirCrear,
  abrirCrearSubtarea,
  busquedaEventos,
  onBuscarEventos,
  modoOscuro,
  alternarTema,
}) {
  const [mostrarCerrarSesion, setMostrarCerrarSesion] = useState(false);
  const [mostrarMenuMovil, setMostrarMenuMovil] = useState(false);
  const [mostrarMenuPerfil, setMostrarMenuPerfil] = useState(false);
  const [mostrarMenuCrear, setMostrarMenuCrear] = useState(false);
  const perfilMenuRef = useRef(null);
  const perfilMenuTriggerRef = useRef(null);
  const crearMenuRef = useRef(null);
  const creacionGlobalDisponible = ruta === "/hoy" || ruta === "/progreso";
  const [perfil, setPerfil] = useState(obtenerDatosPerfil);
  const [fotoPerfilHeader, setFotoPerfilHeader] = useState("");
  const [horasPerfil, setHorasPerfil] = useState(null);

  useEffect(() => {
    let activo = true;
    const cargarPerfil = async () => {
      try {
        const fotoData = await obtenerFotoPerfil();
        if (!activo) return;
        setFotoPerfilHeader(fotoData?.foto_perfil_url || "");
      } catch (error) {
        console.error("No fue posible recuperar el perfil del usuario.", error);
      }
    };
    const actualizarFoto = (event) => {
      const { fotoPerfilUrl, nombre, apellido } = event.detail || {};
      if (typeof fotoPerfilUrl === "string") {
        setFotoPerfilHeader(fotoPerfilUrl);
      } else if (!nombre && !apellido) {
        void cargarPerfil();
      }

      if (nombre || apellido) {
        const nuevoNombre = [nombre, apellido].filter(Boolean).join(" ").trim();
        setPerfil((actual) => ({
          ...actual,
          nombre: nuevoNombre,
          iniciales: nuevoNombre
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte[0]?.toLocaleUpperCase("es-CO") || "")
            .join("") || "EH",
        }));
      }
    };
    void cargarPerfil();
    window.addEventListener("eventhub-profile-updated", actualizarFoto);
    return () => {
      activo = false;
      window.removeEventListener("eventhub-profile-updated", actualizarFoto);
    };
  }, []);

  useEffect(() => {
    let activo = true;
    obtenerPerfilUsuario()
      .then((perfilData) => {
        if (!activo) return;
        const nombre =
          [perfilData?.nombre, perfilData?.apellido]
            .filter(Boolean)
            .join(" ")
            .trim() || obtenerDatosPerfil().nombre;
        setPerfil({
          ...obtenerDatosPerfil(),
          nombre,
          correo: perfilData?.email || obtenerDatosPerfil().correo,
          iniciales: nombre
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte[0]?.toLocaleUpperCase("es-CO") || "")
            .join("") || "EH",
        });
      })
      .catch((error) => {
        console.error("No fue posible recuperar el nombre del usuario.", error);
      });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    obtenerConfiguracionUsuario()
      .then((config) => setHorasPerfil(Number(config?.horas_dia) || 6))
      .catch(() => setHorasPerfil(null));
  }, []);

  useEffect(() => {
    if (!mostrarMenuPerfil) return undefined;
    const cerrarFuera = (event) => {
      if (perfilMenuRef.current && !perfilMenuRef.current.contains(event.target)) {
        setMostrarMenuPerfil(false);
      }
    };
    const cerrarEscape = (event) => {
      if (event.key === "Escape") {
        setMostrarMenuPerfil(false);
        perfilMenuTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [mostrarMenuPerfil, ruta]);

  useEffect(() => {
    if (!mostrarMenuCrear) return undefined;
    const cerrarFuera = (event) => {
      if (crearMenuRef.current && !crearMenuRef.current.contains(event.target)) {
        setMostrarMenuCrear(false);
      }
    };
    const cerrarEscape = (event) => {
      if (event.key === "Escape") {
        setMostrarMenuCrear(false);
        crearMenuRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [mostrarMenuCrear]);

  useEffect(() => {
    setMostrarMenuCrear(false);
  }, [ruta]);

  const confirmarCerrarSesion = () => {
    cerrarSesion();
    navegar("/login");
  };

  return (
    <>
      <header>
        <button
          className="brand"
          type="button"
          onClick={() => navegar("/eventos")}
        >
          <img
            src={modoOscuro ? logo_Blanco : logo_Jaguar}
            alt="Jaguar EventHub"
            className="brand-logo"
          />
          <span>EventHub</span>
        </button>

        <nav aria-label="Navegación principal">
          <button
            className={
              ruta === "/eventos" || ruta.startsWith("/eventos/")
                ? "nav-link active"
                : "nav-link"
            }
            onClick={() => navegar("/eventos")}
          >
            ✦ Eventos
          </button>

          <button
            className={ruta === "/hoy" ? "nav-link active" : "nav-link"}
            onClick={() => navegar("/hoy")}
          >
            Hoy
          </button>

          <button
            className={ruta === "/progreso" ? "nav-link active" : "nav-link"}
            onClick={() => navegar("/progreso")}
          >
            Progreso
          </button>
        </nav>

        <div className="header-spacer" />

        {/* La búsqueda no aparece en /hoy. En /progreso filtra dentro de la
            misma pestaña; en el resto de rutas lleva a la lista de eventos. */}
        {ruta !== "/hoy" && (
          <form
            className="search-placeholder"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (ruta !== "/progreso") {
                navegar("/eventos");
              }
            }}
          >
            <label htmlFor="header-event-search" aria-label="Buscar eventos">⌕</label>
            <input
              id="header-event-search"
              type="search"
              placeholder="Buscar eventos..."
              value={busquedaEventos}
              onChange={(event) => onBuscarEventos(event.target.value)}
            />
          </form>
        )}

        <div
          className={`header-create-anchor${mostrarMenuCrear ? " is-open" : ""}`}
          ref={crearMenuRef}
        >
          <button
            className="btn primary header-create"
            type="button"
            onClick={
              creacionGlobalDisponible
                ? () => setMostrarMenuCrear((visible) => !visible)
                : abrirCrear
            }
            aria-haspopup={creacionGlobalDisponible ? "menu" : undefined}
            aria-expanded={creacionGlobalDisponible ? mostrarMenuCrear : undefined}
            aria-controls={creacionGlobalDisponible ? "header-create-menu" : undefined}
          >
            + Crear
          </button>

          {creacionGlobalDisponible && (
            <CreateMenu
              id="header-create-menu"
              abierto={mostrarMenuCrear}
              onCrearEvento={() => {
                setMostrarMenuCrear(false);
                abrirCrear();
              }}
              onCrearSubtarea={() => {
                setMostrarMenuCrear(false);
                abrirCrearSubtarea();
              }}
            />
          )}
        </div>

        <button
          className="mobile-tools-button"
          type="button"
          aria-label="Abrir herramientas"
          aria-expanded={mostrarMenuMovil}
          onClick={() => setMostrarMenuMovil(true)}
        >
          ☰ <span>Herramientas</span>
        </button>

        <div className="profile-menu-anchor" ref={perfilMenuRef}>
          <button
            ref={perfilMenuTriggerRef}
            className={`profile-menu-trigger ${mostrarMenuPerfil ? "is-open" : ""}`}
            type="button"
            aria-label={`Abrir menú de usuario: ${perfil.nombre.split(/\s+/)[0] || "Organizador"}`}
            aria-expanded={mostrarMenuPerfil}
            aria-haspopup="menu"
            aria-controls="profile-user-menu"
            onClick={() => setMostrarMenuPerfil((visible) => !visible)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              setMostrarMenuPerfil(true);
              window.requestAnimationFrame(() => {
                const items = perfilMenuRef.current?.querySelectorAll('[role="menuitem"]');
                const item = event.key === "ArrowUp" ? items?.[items.length - 1] : items?.[0];
                item?.focus();
              });
            }}
          >
            <span className="avatar profile-menu-avatar" aria-hidden="true">
              {fotoPerfilHeader ? (
                <img src={fotoPerfilHeader} alt="" className="avatar-photo" />
              ) : perfil.iniciales}
            </span>
            <span className="profile-header-name" title={perfil.nombre}>
              {perfil.nombre.split(/\s+/)[0] || "Organizador"}
            </span>
          </button>

          {mostrarMenuPerfil && (
            <div
              id="profile-user-menu"
              className="profile-dropdown"
              role="menu"
              aria-label="Menú del perfil"
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                const items = Array.from(
                  event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')
                );
                if (items.length === 0) return;
                event.preventDefault();
                const currentIndex = items.indexOf(document.activeElement);
                let nextIndex = currentIndex;
                if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = items.length - 1;
                else if (currentIndex < 0) {
                  nextIndex = event.key === "ArrowDown" ? 0 : items.length - 1;
                } else {
                  const direction = event.key === "ArrowDown" ? 1 : -1;
                  nextIndex = (currentIndex + direction + items.length) % items.length;
                }
                items[nextIndex]?.focus();
              }}
            >
              <div className="profile-dropdown-user">
                <div className="profile-dropdown-avatar">
                  {fotoPerfilHeader ? (
                    <img src={fotoPerfilHeader} alt="" />
                  ) : perfil.iniciales}
                  <span className="profile-online-dot" aria-label="Sesión activa" />
                </div>
                <div className="profile-dropdown-identity">
                  <strong>{perfil.nombre}</strong>
                  <span>{perfil.correo || "Cuenta de EventHub"}</span>
                </div>
                <span className="profile-active-badge">ACTIVO</span>
              </div>

              <div className="profile-dropdown-shift">
                <span><span aria-hidden="true">◷</span> Jornada diaria</span>
                <strong>{horasPerfil === null ? "Configuración" : `${horasPerfil}h disponibles`}</strong>
              </div>

              <button
                className="profile-dropdown-action"
                type="button"
                role="menuitem"
                onClick={() => {
                  setMostrarMenuPerfil(false);
                  navegar("/configuracion");
                }}
              >
                <span className="profile-action-icon" aria-hidden="true">⚙</span>
                <span className="profile-action-copy">
                  <strong>Configuración</strong>
                  <small>Foto de perfil y jornada laboral</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>

              <button
                className="profile-dropdown-theme"
                type="button"
                role="menuitem"
                onClick={alternarTema}
              >
                <span className="profile-action-icon" aria-hidden="true">{modoOscuro ? "☀" : "☾"}</span>
                <span className="profile-action-copy">
                  <strong>{modoOscuro ? "Tema claro" : "Tema oscuro"}</strong>
                  <small>{modoOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}</small>
                </span>
                <span className={`profile-theme-switch ${modoOscuro ? "enabled" : ""}`} aria-hidden="true">
                  <span />
                </span>
              </button>

              <button
                className="profile-dropdown-logout"
                type="button"
                role="menuitem"
                onClick={() => {
                  setMostrarMenuPerfil(false);
                  setMostrarCerrarSesion(true);
                }}
              >
                <FaDoorOpen aria-hidden="true" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>

      </header>

      {mostrarMenuMovil && (
        <div
          className="mobile-tools-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMostrarMenuMovil(false);
          }}
        >
          <aside className="mobile-tools-drawer" role="dialog" aria-modal="true" aria-label="Herramientas de EventHub">
            <div className="mobile-tools-heading">
              <strong>Herramientas</strong>
              <button type="button" aria-label="Cerrar herramientas" onClick={() => setMostrarMenuMovil(false)}>×</button>
            </div>

            <button
              className="btn primary mobile-create-event"
              type="button"
              onClick={() => {
                setMostrarMenuMovil(false);
                abrirCrear();
              }}
            >
              ＋ Crear Evento
            </button>

            <form
              className="mobile-tools-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                navegar("/eventos");
                setMostrarMenuMovil(false);
              }}
            >
              <label htmlFor="mobile-event-search">Buscar evento</label>
              <div className="mobile-tools-search-input">
                <span aria-hidden="true">⌕</span>
                <input
                  id="mobile-event-search"
                  type="search"
                  placeholder="Nombre del evento..."
                  value={busquedaEventos}
                  onChange={(event) => onBuscarEventos(event.target.value)}
                />
              </div>
              <button className="btn primary" type="submit">Buscar</button>
            </form>

            <button
              className="mobile-tools-link"
              type="button"
              onClick={() => {
                navegar("/configuracion");
                setMostrarMenuMovil(false);
              }}
            >
              <span aria-hidden="true">⚙</span>
              <span><strong>Capacidad diaria</strong><small>Configurar el límite de horas por día</small></span>
              <span aria-hidden="true">›</span>
            </button>

          </aside>
        </div>
      )}

      {mostrarCerrarSesion && (
        <Modal
          title="¿Deseas cerrar sesión?"
          subtitle="Tu sesión se cerrará en este dispositivo."
          close={() => setMostrarCerrarSesion(false)}
        >
          <div className="logout-confirmation">
            <p>
              Si cierras sesión, tendrás que iniciar sesión nuevamente
              para acceder a EventHub.
            </p>

            <div className="logout-confirmation-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setMostrarCerrarSesion(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                onClick={confirmarCerrarSesion}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
{/* Login */ }
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const validar = () => {
    const next = {};

    if (!email.trim()) {
      next.email = "El correo electrónico es requerido.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Ingresa un correo electrónico válido.";
    }

    if (!password) {
      next.password = "La contraseña es requerida.";
    }

    return next;
  };

  const enviar = async (event) => {
    event.preventDefault();

    const next = validar();

    setErrores(next);
    setErrorServidor("");

    if (Object.keys(next).length > 0) {
      return;
    }

    setEnviando(true);

    try {
      const data = await iniciarSesion(
        email.trim(),
        password
      );

      guardarSesion(data);

      onLogin();
    } catch (error) {
      setErrorServidor(
        error.message || "No fue posible iniciar sesión."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">

        {/* LOGO */}
        <div className="login-brand">
          <img
            src={logo_EventHub}
            alt="EventHub"
            className="login-logo"
          />

          <h1 className="login-subtitle">
            INICIAR SESION
          </h1>

          <span className="security-badge">
            🛡 Portal Operativo Seguro
          </span>
        </div>

        {/* ERROR DEL SERVIDOR */}
        {errorServidor && (
          <div className="login-error" role="alert">
            <strong>No fue posible iniciar sesión.</strong>
            <span>{errorServidor}</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={enviar} noValidate>

          <div className="login-field">
            <label htmlFor="login-email">
              Correo electrónico o usuario
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">✉</span>

              <input
                id="login-email"
                type="email"
                placeholder="ejemplo@organizacion.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);

                  setErrores((prev) => ({
                    ...prev,
                    email: "",
                  }));

                  setErrorServidor("");
                }}
                autoComplete="email"
                autoFocus
                aria-invalid={Boolean(errores.email)}
                className={errores.email ? "input-error" : ""}
              />
            </div>

            {errores.email && (
              <p className="inline-error" role="alert">
                {errores.email}
              </p>
            )}
          </div>

          <div className="login-field">
            <label htmlFor="login-password">
              Contraseña
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">♙</span>

              <input
                id="login-password"
                type={mostrarPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);

                  setErrores((prev) => ({
                    ...prev,
                    password: "",
                  }));

                  setErrorServidor("");
                }}
                autoComplete="current-password"
                aria-invalid={Boolean(errores.password)}
                className={errores.password ? "input-error" : ""}
              />

              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setMostrarPassword((prev) => !prev)}
                aria-label={
                  mostrarPassword
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"
                }
              >
                {mostrarPassword ? <FaEye /> : <FaEyeSlash />}
              </button>
            </div>

            {errores.password && (
              <p className="inline-error" role="alert">
                {errores.password}
              </p>
            )}
          </div>

          {/* OPCIONES */}
          <div className="login-options">

            <label className="remember-option">
              <input type="checkbox" />
              <span>
                Recordar sesión en este equipo
              </span>
            </label>

            <button
              type="button"
              className="forgot-password"
              disabled
            >
              ¿Olvidaste tu contraseña?
            </button>

          </div>

          {/* LOGIN */}
          <button
            className="login-submit"
            type="submit"
            disabled={enviando}
          >
            {enviando
              ? "Iniciando sesión..."
              : (
                <>
                  Iniciar Sesión
                  <span>→</span>
                </>
              )}
          </button>

        </form>

        {/* REGISTRO */}
        <div className="login-register">
          <span>¿Eres un usuario nuevo?</span>

          <button
            type="button"
            onClick={() => navegar("/registro")}
          >
            Regístrate
          </button>
        </div>

        {/* AVISO DE SEGURIDAD */}
        <div className="security-message">
          <FaLock className="security-message-icon" />

          <span>
            Conexión cifrada de extremo a extremo.
            Acceso exclusivo para organizadores autorizados.
          </span>
        </div>

      </section>

      {/* FOOTER */}
      <footer className="login-footer">
        <p>EventHub © 2025 • Todos los derechos reservados.</p>

        <div>
          <button type="button">Términos de servicio</button>
          <span>•</span>
          <button type="button">Política de privacidad</button>
          <span>•</span>
          <button type="button">Soporte TI</button>
        </div>
      </footer>

    </main>
  );
}

function FormularioEvento({ onCancelar, onCrear, onProgress }) {
  const [formulario, setFormulario] = useState({
    titulo: "",
    fecha: "",
    horas: "",
    usuario_responsable: "",
    descripcion: "",
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [crearSubtareaInicial, setCrearSubtareaInicial] = useState(false);
  const [subtareas, setSubtareas] = useState([
    { id: "subtarea-1", titulo: "", horas_estimadas: "", estado: "", dia_objetivo: "", responsable: "", notas: "" },
  ]);
  const [errorSubtarea, setErrorSubtarea] = useState("");
  const [conflicto, setConflicto] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [capacidad, setCapacidad] = useState(6);

  const contadorSubtarea = useRef(1);

  const agregarSubtarea = () => {
    contadorSubtarea.current += 1;
    const id = `subtarea-${contadorSubtarea.current}`;
    setSubtareas((prev) => [
      ...prev,
      {
        id,
        titulo: "",
        horas_estimadas: "",
        estado: "",
        dia_objetivo: "",
        responsable: "",
        notas: "",
      },
    ]);
    setErrorSubtarea("");
  };

  const quitarSubtarea = (id) => {
    setSubtareas((prev) =>
      prev.length > 1 ? prev.filter((item) => item.id !== id) : prev
    );
    setErrorSubtarea("");
  };

  const actualizarSubtarea = (id, campo, valor) => {
    setSubtareas((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    );

    setErrorSubtarea("");
  };

  const cargarAgenda = async () => {
    const [subtareasData, hoyData, eventosData] = await Promise.all([
      obtenerSubtareas(),
      obtenerHoy(),
      obtenerEventos(),
    ]);

    const lista = Array.isArray(subtareasData) ? subtareasData : [];
    const eventosPorId = new Map(
      (Array.isArray(eventosData) ? eventosData : []).map((evento) => [String(evento.id), evento])
    );
    const agendaCargada = lista
      .map((item) => ({
        ...item,
        evento: eventosPorId.get(String(item.evento_id)) || null,
        evento_titulo: eventosPorId.get(String(item.evento_id))?.titulo || null,
        fechaObjetivo: item.dia_objetivo || null,
      }))
      .filter((item) => normalizarEstado(item.estado) !== "hecho");

    const limite = Number(hoyData?.resumen?.limite_horas_dia);
    const capacidadCargada =
      Number.isInteger(limite) && limite > 0 ? limite : 6;

    setAgenda(agendaCargada);
    setCapacidad(capacidadCargada);

    return { agenda: agendaCargada, capacidad: capacidadCargada };
  };

  useEffect(() => {
    onProgress?.({
      porcentaje: 0,
      pasosCompletados: 0,
      pasos: [false, false, false, false],
    });
  }, [onProgress]);

  const actualizar = (event) => {
    const { name, value } = event.target;

    const siguiente = { ...formulario, [name]: value };
    setFormulario(siguiente);

    const pasos = [
      Boolean(siguiente.titulo.trim()),
      Boolean(siguiente.fecha),
      Boolean(
        siguiente.horas &&
        Number(siguiente.horas) > 0 &&
        Number(siguiente.horas) <= 24
      ),
      Boolean(siguiente.usuario_responsable.trim()),
    ];
    const pasosCompletados = pasos.filter(Boolean).length;

    onProgress?.({
      porcentaje: Math.round((pasosCompletados / 4) * 100),
      pasosCompletados,
      pasos,
    });

    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
    if (name === "fecha") {
      setSubtareas((prev) =>
        prev.map((item) => ({
          ...item,
          dia_objetivo: limitarFechaSubtarea(
            item.dia_objetivo || value,
            value
          ),
        }))
      );
    }
  };

  const validar = () => {
    const next = {};

    if (!formulario.titulo.trim()) {
      next.titulo = "El título es requerido.";
    }

    const hoy = obtenerFechaLocalHoy();

    if (!formulario.fecha) {
      next.fecha = "La fecha del evento es requerida.";
    } else if (formulario.fecha < hoy) {
      next.fecha = "La fecha del evento no puede ser anterior a hoy.";
    }

    const horas = Number(formulario.horas);

    if (
      !formulario.horas ||
      horas <= 0
    ) {
      next.horas = "La duración debe ser mayor a 0 minutos.";
    } else if (horas > 24) {
      next.horas = "Las horas no pueden ser mayores a 24.";
    }

    if (!formulario.usuario_responsable.trim()) {
      next.usuario_responsable = "El usuario responsable es requerido.";
    }

    return next;
  };

  const prepararSubtareas = () => {
    const errores = [];
    const invalidas = [];

    subtareas.forEach((item, indice) => {
      const erroresItem = [];

      if (!item.titulo.trim()) erroresItem.push("indica el nombre");
      if (
        !item.horas_estimadas ||
        Number(item.horas_estimadas) <= 0 ||
        Number(item.horas_estimadas) > 24
      ) {
        erroresItem.push("indica una duración mayor a 0 minutos y hasta 24 horas");
      }
      if (!item.estado) erroresItem.push("selecciona el estado");
      if (
        !limitarFechaSubtarea(
          item.dia_objetivo || formulario.fecha,
          formulario.fecha
        )
      ) {
        erroresItem.push(
          "selecciona una fecha límite entre hoy y la fecha del evento"
        );
      }

      if (erroresItem.length) {
        invalidas.push(indice);
        errores.push(
          `Para crear la subtarea ${indice + 1}, ${erroresItem.join(", ")}.`
        );
      }
    });

    return { errores, invalidas };
  };

  const guardarEvento = async (subtareasAGuardar) => {
    setEnviando(true);
    try {
      await onCrear(
        {
          titulo: formulario.titulo.trim(),
          fecha: formulario.fecha,
          horas: Number(formulario.horas),
          usuario_responsable: formulario.usuario_responsable.trim(),
          descripcion: formulario.descripcion.trim() || null,
        },
        subtareasAGuardar.length ? subtareasAGuardar : null
      );
    } catch (error) {
      setErrorServidor(error.message);
      setEnviando(false);
    }
  };

  const aplicarDecisionSobrecarga = async ({ fecha, horas }) => {
    const adjusted = subtareas.map((item) =>
      String(item.id) === String(conflicto?.id_subtarea_causa)
        ? { ...item, dia_objetivo: fecha, horas_estimadas: horas }
        : item
    );
    const nuevas = prepararNuevasParaConflicto(
      adjusted,
      formulario.fecha,
      formulario.fecha
    );
    const conflictoRestante = buscarConflictoSubtareasNuevas({
      agenda,
      subtareasNuevas: nuevas,
      capacidadDiaria: capacidad,
      eventoTitulo: formulario.titulo.trim(),
      fechaLimite: obtenerFechaLimiteSubtarea(formulario.fecha),
    });

    if (conflictoRestante) {
      setConflicto(conflictoRestante);
      return;
    }

    await guardarEvento(
      nuevas.map((item) => ({
        titulo: item.titulo,
        horas_estimadas: Number(item.horas_estimadas),
        estado: item.estado,
        dia_objetivo: item.fechaObjetivo,
        responsable: item.responsable.trim() || null,
        notas: item.notas.trim() || null,
      }))
    );
  };

  const enviar = async (event) => {
    event.preventDefault();
    const next = validar();
    setErrores(next);
    setErrorServidor("");

    if (crearSubtareaInicial) {
      const { errores } = prepararSubtareas();

      if (errores.length) {
        setErrorSubtarea(errores.join(" "));
        return;
      }
    }

    setErrorSubtarea("");
    if (Object.keys(next).length) return;

    if (!crearSubtareaInicial) {
      await guardarEvento([]);
      return;
    }

    let agendaCargada;
    let capacidadCargada;
    try {
      const cargada = await cargarAgenda();
      agendaCargada = cargada.agenda;
      capacidadCargada = cargada.capacidad;
    } catch (error) {
      console.error("Error al verificar la agenda:", error);
      setErrorServidor(
        error.message ||
        "No fue posible comprobar la capacidad diaria antes de crear el evento."
      );
      return;
    }

    const nuevas = prepararNuevasParaConflicto(
      subtareas,
      formulario.fecha,
      formulario.fecha
    );
    const conflictoNuevo = buscarConflictoSubtareasNuevas({
      agenda: agendaCargada,
      subtareasNuevas: nuevas,
      capacidadDiaria: capacidadCargada,
      eventoTitulo: formulario.titulo.trim(),
      fechaLimite: obtenerFechaLimiteSubtarea(formulario.fecha),
    });

    if (conflictoNuevo) {
      setConflicto(conflictoNuevo);
      return;
    }

    await guardarEvento(
      nuevas.map((item) => ({
        titulo: item.titulo,
        horas_estimadas: Number(item.horas_estimadas),
        estado: item.estado,
        dia_objetivo: item.fechaObjetivo,
        responsable: item.responsable.trim() || null,
        notas: item.notas.trim() || null,
      }))
    );
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="titulo">Título del evento <span>*</span></label><small>Obligatorio</small></div>
      <input id="titulo" name="titulo" value={formulario.titulo} onChange={actualizar} placeholder="Ej. Conferencia de Tecnología 2026" aria-invalid={Boolean(errores.titulo)} autoFocus />
      {errores.titulo && <p className="inline-error" role="alert">{errores.titulo}</p>}

      <div className="form-two-columns create-event-main-fields">
        <div>
          <div className="field-header"><label htmlFor="fecha">Fecha del evento <span>*</span></label><small>Obligatorio</small></div>
          <input
            id="fecha"
            name="fecha"
            type="date"
            min={obtenerFechaLocalHoy()}
            value={formulario.fecha}
            onChange={actualizar}
            aria-invalid={Boolean(errores.fecha)}
          />
          {errores.fecha ? (
            <p className="inline-error" role="alert">{errores.fecha}</p>
          ) : (
            <p className="helper">ⓘ La fecha debe ser hoy o una fecha futura</p>
          )}
        </div>
        <div>
          <div className="field-header"><label htmlFor="horas-hours">Duración estimada <span>*</span></label><small>Horas y minutos</small></div>
          <DurationInput
            id="horas"
            name="horas"
            value={formulario.horas}
            onChange={actualizar}
            ariaInvalid={Boolean(errores.horas)}
          />
          {errores.horas && <p className="inline-error" role="alert">{errores.horas}</p>}
          {!errores.horas && <p className="helper">ⓘ Indica la duración en horas y minutos (máximo 24h)</p>}
        </div>
      </div>

      <div className="field-header">
        <label htmlFor="usuario_responsable">
          Usuario responsable <span>*</span>
        </label>
        <small>Obligatorio</small>
      </div>

      <input
        id="usuario_responsable"
        name="usuario_responsable"
        value={formulario.usuario_responsable}
        onChange={actualizar}
        placeholder="Ej. Laura V. (Coordinadora General)"
        aria-invalid={Boolean(errores.usuario_responsable)}
      />

      {errores.usuario_responsable && (
        <p className="inline-error" role="alert">
          {errores.usuario_responsable}
        </p>
      )}

      <div className="field-header"><label htmlFor="descripcion">Descripción</label><small>Opcional</small></div>
      <textarea id="descripcion" name="descripcion" value={formulario.descripcion} onChange={actualizar} placeholder="Describe el objetivo, alcance o información útil del evento." />

      <section className="create-event-subtask">
        <label className="create-event-subtask-toggle">
          <input
            type="checkbox"
            checked={crearSubtareaInicial}
            onChange={(event) => {
              setCrearSubtareaInicial(event.target.checked);
              setErrorSubtarea("");
            }}
          />
          <span>
            <strong>Crear una subtarea</strong>
            <small>¿Qué necesitas hacer para este evento? Agrega subtareas para organizar tus actividades y encontrarlas dentro del evento.</small>
          </span>
        </label>
        {crearSubtareaInicial && (
          <div className="create-event-subtask-fields">
            <p className="create-event-subtask-help">
              Las subtareas son actividades necesarias para organizar o ejecutar el evento; puedes asignar responsable, fecha y duración estimada.
            </p>
            {subtareas.map((item, indice) => (
              <div className="create-event-subtask-item" key={item.id}>
                <div className="field-header">
                  <label htmlFor={`evento-subtarea-titulo-${item.id}`}>
                    Nombre de la subtarea {subtareas.length > 1 ? `${indice + 1}` : ""} <span>*</span>
                  </label>
                  {subtareas.length > 1 && (
                    <button
                      type="button"
                      className="create-event-subtask-remove"
                      onClick={() => quitarSubtarea(item.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <input
                  id={`evento-subtarea-titulo-${item.id}`}
                  value={item.titulo}
                  onChange={(event) => actualizarSubtarea(item.id, "titulo", event.target.value)}
                  placeholder="Ej. Preparar presentación"
                />
                <div className="form-two-columns create-event-subtask-row">
                  <div>
                    <div className="field-header">
                      <label htmlFor={`evento-subtarea-horas-${item.id}-hours`}>Duración <span>*</span></label>
                    </div>
                    <DurationInput
                      id={`evento-subtarea-horas-${item.id}`}
                      name="horas_estimadas"
                      value={item.horas_estimadas}
                      onChange={(event) => actualizarSubtarea(item.id, "horas_estimadas", event.target.value)}
                    />
                  </div>
                  <div>
                    <div className="field-header">
                      <label htmlFor={`evento-subtarea-estado-${item.id}`}>Estado</label>
                    </div>
                    <select
                      id={`evento-subtarea-estado-${item.id}`}
                      value={item.estado}
                      onChange={(event) => actualizarSubtarea(item.id, "estado", event.target.value)}
                    >
                      <option value="">Selecciona un estado</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="hecho">Hecho</option>
                      <option value="pospuesto">Pospuesto</option>
                    </select>
                  </div>
                </div>
                <div className="field-header">
                  <label htmlFor={`evento-subtarea-fecha-${item.id}`}>Fecha límite <span>*</span></label>
                </div>
                <input
                  id={`evento-subtarea-fecha-${item.id}`}
                  type="date"
                  min={obtenerFechaLocalHoy()}
                  max={formulario.fecha || undefined}
                  value={item.dia_objetivo || ""}
                  onChange={(event) => actualizarSubtarea(item.id, "dia_objetivo", event.target.value)}
                  aria-invalid={Boolean(errorSubtarea)}
                  aria-describedby={`evento-subtarea-fecha-ayuda-${item.id}`}
                />
                <p className="helper" id={`evento-subtarea-fecha-ayuda-${item.id}`}>
                  {formulario.fecha
                    ? "Selecciona una fecha desde hoy hasta la fecha del evento."
                    : "Puedes elegir una fecha desde hoy; al guardar, debe ser igual o anterior a la fecha del evento."}
                </p>
                <StitchOptionalSection
                  id={`evento-subtarea-responsable-${item.id}`}
                  icon={<FaUser />}
                  title="Asignar responsable"
                >
                  <label htmlFor={`evento-subtarea-responsable-${item.id}-input`}>Responsable de la subtarea</label>
                  <input
                    id={`evento-subtarea-responsable-${item.id}-input`}
                    value={item.responsable || ""}
                    onChange={(event) => actualizarSubtarea(item.id, "responsable", event.target.value)}
                    placeholder="Nombre de la persona responsable"
                  />
                </StitchOptionalSection>
                <StitchOptionalSection
                  id={`evento-subtarea-notas-${item.id}`}
                  icon={<FaRegFileAlt />}
                  title="Agregar nota"
                >
                  <label htmlFor={`evento-subtarea-notas-${item.id}-textarea`}>Notas e instrucciones</label>
                  <textarea
                    id={`evento-subtarea-notas-${item.id}-textarea`}
                    value={item.notas || ""}
                    onChange={(event) => actualizarSubtarea(item.id, "notas", event.target.value)}
                    placeholder="Agrega detalles o instrucciones para esta subtarea"
                    rows={2}
                    maxLength={300}
                  />
                </StitchOptionalSection>
              </div>
            ))}
            <button
              type="button"
              className="create-event-subtask-add"
              onClick={agregarSubtarea}
            >
              + Agregar nueva subtarea
            </button>
            <p className="helper">
              Selecciona entre hoy y la fecha del evento
              {formulario.fecha ? ` (${formatearFecha(formulario.fecha)})` : "."}
            </p>
            {errorSubtarea && <p className="inline-error" role="alert">{errorSubtarea}</p>}
          </div>
        )}
      </section>
      {conflicto && (
        <ModalResolucionSobrecarga
          key={`${conflicto.id_subtarea_causa}-${conflicto.fecha_objetivo}-${conflicto.horas_asignadas}-${conflicto.exceso_horas}-${conflicto.horas_otras ?? ""}-${conflicto.fecha_recomendada || ""}`}
          conflicto={conflicto}
          horasCausa={
            Number(
              subtareas.find(
                (item) =>
                  String(item.id) ===
                  String(conflicto.id_subtarea_causa)
              )?.horas_estimadas
            )
          }
          tituloCausa={
            subtareas.find(
              (item) =>
                String(item.id) === String(conflicto.id_subtarea_causa)
            )?.titulo?.trim() || ""
          }
          guardando={enviando}
          onCancelar={() => setConflicto(null)}
          onAccion={aplicarDecisionSobrecarga}
        />
      )}

      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible crear el evento.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={enviando}>{enviando && <span className="mini-spinner" />} {enviando ? "Creando…" : "Crear evento"}</button>
      </div>
    </form>
  );
}

function CrearSubtareaForm({
  eventoId,
  eventoFecha,
  eventoTitulo,
  permitirCambiarEvento = false,
  onCancelar,
  onCreada,
}) {
  const seleccionEvento = permitirCambiarEvento || !eventoId;
  const [form, setForm] = useState({
    nombre: "",
    horas: "",
    estado: "pendiente",
    dia_objetivo: limitarFechaSubtarea(eventoFecha, eventoFecha),
    responsable: "",
    notas: "",
  });

  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [conflicto, setConflicto] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [capacidad, setCapacidad] = useState(6);

  const [eventosDisponibles, setEventosDisponibles] = useState([]);
  const [eventoSeleccionadoId, setEventoSeleccionadoId] = useState(
    eventoId ? String(eventoId) : ""
  );
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState("");
  const [responsablesDisponibles, setResponsablesDisponibles] = useState([]);
  const enviandoRef = useRef(false);

  // Datos del evento activo. En el detalle del evento se conservan las props
  // originales; en /hoy se resuelven desde el selector obligatorio.
  const eventoSeleccionado = eventosDisponibles.find(
    (evento) => String(evento.id) === String(eventoSeleccionadoId)
  );
  const eventoActivo = seleccionEvento
    ? eventoSeleccionado
    : eventoSeleccionado || {
        id: eventoId,
        fecha: eventoFecha,
        titulo: eventoTitulo,
      };
  const eventoIdActual = eventoActivo?.id ?? (seleccionEvento ? "" : eventoId);
  const fechaEventoActual = eventoActivo?.fecha ?? "";
  const tituloEventoActual = eventoActivo?.titulo ?? "";

  const cargarOpciones = async () => {
    try {
      const [eventosData, subtareasData] = await Promise.all([
        obtenerEventos(),
        obtenerSubtareas(),
      ]);

      const listaEventos = Array.isArray(eventosData) ? eventosData : [];
      const listaSubtareas = Array.isArray(subtareasData) ? subtareasData : [];

      setEventosDisponibles(listaEventos);
      setErrorEventos("");

      // No existe un endpoint de usuarios en el contrato actual. Las opciones
      // se construyen con el usuario de la sesión y los responsables ya
      // registrados en eventos/subtareas, sin alterar el backend.
      const nombres = new Set();
      const perfil = obtenerDatosPerfil();
      if (perfil.nombre && perfil.nombre !== "Organizador") {
        nombres.add(perfil.nombre);
      }

      const agregarResponsable = (registro) => {
        const nombre = obtenerResponsableSubtarea(registro);
        if (nombre) nombres.add(nombre);
      };

      listaEventos.forEach(agregarResponsable);
      listaSubtareas.forEach(agregarResponsable);

      setResponsablesDisponibles(
        Array.from(nombres).sort((a, b) => a.localeCompare(b, "es"))
      );
    } catch (error) {
      console.error("Error al cargar eventos y responsables:", error);
      setErrorEventos(
        error.message ||
          "No fue posible cargar los eventos disponibles."
      );
    } finally {
      setCargandoEventos(false);
    }
  };

  useEffect(() => {
    cargarOpciones();
  }, []);

  const reintentarOpciones = () => {
    setCargandoEventos(true);
    setErrorEventos("");
    cargarOpciones();
  };

  const cargarAgenda = async () => {
    const [subtareasData, hoyData, eventosData] = await Promise.all([
      obtenerSubtareas(),
      obtenerHoy(),
      obtenerEventos(),
    ]);

    const lista = Array.isArray(subtareasData) ? subtareasData : [];
    const eventosPorId = new Map(
      (Array.isArray(eventosData) ? eventosData : []).map((evento) => [String(evento.id), evento])
    );
    const agendaCargada = lista
      .map((subtarea) => ({
        ...subtarea,
        evento: eventosPorId.get(String(subtarea.evento_id)) || null,
        evento_titulo: eventosPorId.get(String(subtarea.evento_id))?.titulo || null,
        fechaObjetivo: subtarea.dia_objetivo || null,
      }))
      .filter((subtarea) => normalizarEstado(subtarea.estado) !== "hecho");

    const limite = Number(hoyData?.resumen?.limite_horas_dia);
    const capacidadCargada =
      Number.isInteger(limite) && limite > 0 ? limite : 6;

    setAgenda(agendaCargada);
    setCapacidad(capacidadCargada);

    return { agenda: agendaCargada, capacidad: capacidadCargada };
  };

  const registrarSubtarea = async (datos) => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErrorServidor("");

    try {
      await crearSubtarea(datos);
      setConflicto(null);
      onCreada();
    } catch (error) {
      console.error("Error al crear subtarea:", error);
      setErrorServidor(
        error.message || "No fue posible crear la subtarea."
      );
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const aplicarDecisionSobrecarga = async ({ fecha, horas }) => {
    if (!esFechaSubtareaValida(fecha, fechaEventoActual)) {
      setErrores((prev) => ({
        ...prev,
        dia_objetivo:
          "Selecciona una fecha límite entre hoy y la fecha del evento.",
      }));
      setConflicto(null);
      return;
    }

    const conflictoResidual = buscarConflictoSubtareasNuevas({
      agenda,
      subtareasNuevas: [{
        id: "nueva-subtarea",
        titulo: form.nombre.trim(),
        horas_estimadas: Number(horas),
        estado: form.estado,
        fechaObjetivo: fecha,
      }],
      capacidadDiaria: capacidad,
      eventoTitulo: tituloEventoActual,
      fechaLimite: obtenerFechaLimiteSubtarea(fechaEventoActual),
    });

    if (conflictoResidual) {
      setConflicto(conflictoResidual);
      return;
    }

    await registrarSubtarea({
      evento_id: eventoIdActual,
      titulo: form.nombre.trim(),
      dia_objetivo: fecha,
      horas_estimadas: Number(horas),
      estado: form.estado,
      responsable: form.responsable.trim() || null,
      notas: form.notas.trim() || null,
    });
  };

  const actualizar = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrores((prev) => ({
      ...prev,
      [name]: "",
    }));

    setErrorServidor("");
  };

  const seleccionarEvento = (event) => {
    const nuevoId = event.target.value;
    const evento = eventosDisponibles.find(
      (item) => String(item.id) === String(nuevoId)
    );

    setEventoSeleccionadoId(nuevoId);
    setForm((prev) => ({
      ...prev,
      // Al cambiar de evento se conserva la fecha si sigue dentro del rango
      // permitido; de lo contrario se ajusta al límite del nuevo evento.
      dia_objetivo: evento
        ? limitarFechaSubtarea(prev.dia_objetivo, evento.fecha)
        : "",
    }));
    setErrores((prev) => ({
      ...prev,
      evento_id: "",
      dia_objetivo: "",
    }));
    setErrorServidor("");
  };

  const enviar = async (event) => {
    event.preventDefault();

    const next = {};

    if (seleccionEvento && !eventoIdActual) {
      next.evento_id = "Selecciona el evento al que pertenece la subtarea.";
    }

    if (!form.nombre.trim()) {
      next.nombre = "El nombre de la subtarea es requerido.";
    }

    if (
      !form.horas ||
      Number(form.horas) <= 0 ||
      Number(form.horas) > 24
    ) {
      next.horas = "La duración debe ser mayor a 0 minutos y hasta 24 horas.";
    }

    if (
      !esFechaSubtareaValida(form.dia_objetivo, fechaEventoActual)
    ) {
      next.dia_objetivo =
        "Selecciona una fecha límite entre hoy y la fecha del evento.";
    }
    setErrores(next);

    if (Object.keys(next).length) return;

    if (normalizarEstado(form.estado) !== "hecho") {
      let agendaActual;
      let capacidadActual;

      try {
        const cargada = await cargarAgenda();
        agendaActual = cargada.agenda;
        capacidadActual = cargada.capacidad;
      } catch (error) {
        console.error("Error al verificar la agenda:", error);
        setErrorServidor(
          error.message ||
          "No fue posible comprobar la capacidad diaria antes de crear la subtarea."
        );
        return;
      }

      const conflictoNuevo = buscarConflictoSubtareasNuevas({
        agenda: agendaActual,
        subtareasNuevas: [{
          id: "nueva-subtarea",
          titulo: form.nombre.trim(),
          horas_estimadas: Number(form.horas),
          estado: form.estado,
          fechaObjetivo: form.dia_objetivo,
        }],
        capacidadDiaria: capacidadActual,
        eventoTitulo: tituloEventoActual,
        fechaLimite: obtenerFechaLimiteSubtarea(fechaEventoActual),
      });

      if (conflictoNuevo) {
        setConflicto(conflictoNuevo);
        return;
      }
    }

    await registrarSubtarea({
      evento_id: eventoIdActual,
      titulo: form.nombre.trim(),
      dia_objetivo: form.dia_objetivo,
      horas_estimadas: Number(form.horas),
      estado: form.estado,
      responsable: form.responsable.trim() || null,
      notas: form.notas.trim() || null,
    });
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header">
        <label htmlFor="sub-nombre">
          Nombre de la subtarea <span>*</span>
        </label>
      </div>

      <input
        id="sub-nombre"
        name="nombre"
        value={form.nombre}
        onChange={actualizar}
        placeholder="Ej. Preparar presentación"
        aria-invalid={Boolean(errores.nombre)}
        autoFocus
      />

      {errores.nombre && (
        <p className="inline-error" role="alert">
          {errores.nombre}
        </p>
      )}

      {seleccionEvento ? (
        <>
          <div className="field-header">
            <label htmlFor="sub-evento">
              Evento asociado <span>*</span>
            </label>
          </div>

          <select
            id="sub-evento"
            name="evento_id"
            className="create-subtask-event-select"
            value={eventoSeleccionadoId}
            onChange={seleccionarEvento}
            aria-invalid={Boolean(errores.evento_id)}
            disabled={
              cargandoEventos ||
              (Boolean(errorEventos) && eventosDisponibles.length === 0)
            }
          >
            <option value="">
              {cargandoEventos
                ? "Cargando eventos…"
                : "Selecciona un evento"}
            </option>

            {eventosDisponibles.map((evento) => {
              const vencido =
                String(evento.fecha || "").slice(0, 10) <
                obtenerFechaLocalHoy();

              return (
                <option key={evento.id} value={evento.id} disabled={vencido}>
                  {evento.titulo}
                  {evento.fecha ? ` · ${formatearFecha(evento.fecha)}` : ""}
                  {vencido ? " (vencido)" : ""}
                </option>
              );
            })}
          </select>

          {errorEventos && (
            <div className="event-load-error" role="alert">
              <p className="inline-error">{errorEventos}</p>
              <button
                className="btn ghost"
                type="button"
                onClick={reintentarOpciones}
              >
                Reintentar
              </button>
            </div>
          )}

          {!cargandoEventos && !errorEventos && eventosDisponibles.length === 0 && (
            <p className="helper">
              No tienes eventos disponibles. Crea un evento primero.
            </p>
          )}

          {errores.evento_id && (
            <p className="inline-error" role="alert">
              {errores.evento_id}
            </p>
          )}
        </>
      ) : (
        <div className="subtask-event-locked">
          <span className="subtask-event-locked-icon" aria-hidden="true">
            <FaCalendarAlt />
          </span>
          <span className="subtask-event-locked-copy">
            <small>EVENTO ASOCIADO</small>
            <strong>{eventoTitulo || "Evento"}</strong>
          </span>
          <span className="subtask-event-locked-date">
            {formatearFecha(eventoFecha)}
          </span>
        </div>
      )}

      <div className="field-header">
        <label htmlFor="sub-dia-objetivo">
          Fecha límite <span>*</span>
        </label>
      </div>

      <input
        id="sub-dia-objetivo"
        name="dia_objetivo"
        type="date"
        min={obtenerFechaLocalHoy()}
        max={fechaEventoActual || undefined}
        value={form.dia_objetivo}
        onChange={actualizar}
        disabled={
          !fechaEventoActual || fechaEventoActual < obtenerFechaLocalHoy()
        }
        aria-invalid={Boolean(errores.dia_objetivo)}
      />
      <p className="helper">
        {fechaEventoActual
          ? `Selecciona entre hoy y la fecha del evento (${formatearFecha(fechaEventoActual)}).`
          : "Selecciona primero el evento asociado."}
      </p>

      {errores.dia_objetivo && (
        <p className="inline-error" role="alert">
          {errores.dia_objetivo}
        </p>
      )}

      <div className="form-two-columns create-subtask-duration-status-row">
        <div>
          <div className="field-header">
            <label htmlFor="sub-horas-hours">
              Duración estimada <span>*</span>
            </label>
          </div>

          <DurationInput
            id="sub-horas"
            name="horas"
            value={form.horas}
            onChange={actualizar}
            ariaInvalid={Boolean(errores.horas)}
          />

          {errores.horas ? (
            <p className="inline-error" role="alert">
              {errores.horas}
            </p>
          ) : (
            <p className="helper">
              ⓘ Ingresa horas y minutos (máximo 24h)
            </p>
          )}
        </div>

        <div>
          <div className="field-header">
            <label htmlFor="sub-estado">Estado</label>
          </div>

          <select
            id="sub-estado"
            name="estado"
            value={form.estado}
            onChange={actualizar}
          >
            <option value="pendiente">Pendiente</option>
            <option value="hecho">Hecho</option>
            <option value="pospuesto">Pospuesto</option>
          </select>

          <p className="helper">
            Estado inicial asignado
          </p>
        </div>
      </div>

      <StitchOptionalSection
        id="sub-responsable"
        icon={<FaUser />}
        title="Asignar responsable"
        defaultOpen={Boolean(form.responsable)}
      >
        <label htmlFor="sub-responsable-select">
          Responsable de la subtarea
        </label>
        <ResponsibleCombobox
          id="sub-responsable-select"
          value={form.responsable}
          options={responsablesDisponibles}
          onChange={(responsable) => {
            setForm((prev) => ({ ...prev, responsable }));
            setErrorServidor("");
          }}
        />
        <p className="helper">
          Elige un responsable existente o escribe un nombre. Puedes dejarlo vacío.
        </p>
      </StitchOptionalSection>

      <StitchOptionalSection
        id="sub-notas"
        icon={<FaRegFileAlt />}
        title="Agregar nota"
        defaultOpen={Boolean(form.notas)}
      >
        <label htmlFor="sub-notas">Notas e instrucciones</label>
        <textarea
          id="sub-notas"
          name="notas"
          value={form.notas}
          onChange={actualizar}
          placeholder="Añade notas o especificaciones de apoyo..."
          rows={3}
          maxLength={300}
        />
        <p className="helper">{form.notas.length}/300 caracteres</p>
      </StitchOptionalSection>

      {errorServidor && (
        <div className="alert alert-error" role="alert">
          <b>No fue posible crear la subtarea.</b>
          <span>{errorServidor}</span>
        </div>
      )}

      <div className="actions">
        <button
          className="btn ghost"
          type="button"
          onClick={onCancelar}
          disabled={enviando}
        >
          Cancelar
        </button>

        <button
          className="btn primary"
          type="submit"
          disabled={enviando}
        >
          {enviando && <span className="mini-spinner" />}
          {enviando ? "Creando…" : "Crear subtarea"}
        </button>
      </div>
      {conflicto && (
        <ModalResolucionSobrecarga
          key={`${conflicto.id_subtarea_causa}-${conflicto.fecha_objetivo}-${conflicto.horas_asignadas}-${conflicto.exceso_horas}-${conflicto.horas_otras ?? ""}-${conflicto.fecha_recomendada || ""}`}
          conflicto={conflicto}
          horasCausa={Number(form.horas)}
          tituloCausa={form.nombre.trim()}
          guardando={enviando}
          onCancelar={() => setConflicto(null)}
          onAccion={aplicarDecisionSobrecarga}
        />
      )}
    </form>
  );
}


function ConfirmModal({ title, message, confirmLabel = "Eliminar", close, onConfirm, loading = false }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && !loading && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, loading]);

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !loading && close()}>
      <section className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon">!</div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message" className="modal-subtitle">{message}</p>
        <div className="actions">
          <button ref={cancelRef} className="btn ghost" type="button" onClick={close} disabled={loading}>Cancelar</button>
          <button className="btn danger" type="button" onClick={onConfirm} disabled={loading}>
            {loading && <span className="mini-spinner danger-spinner" />}
            {loading ? "Eliminando…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function EvidencePreviewModal({ url, title, onClose }) {
  const [errorImagen, setErrorImagen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const manejarEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [onClose]);

  return (
    <div
      className="evidence-preview-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="evidence-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-preview-title"
      >
        <header className="evidence-preview-header">
          <div>
            <FaPaperclip aria-hidden="true" />
            <h2 id="evidence-preview-title">Evidencia adjunta</h2>
            <p>{title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="evidence-preview-close"
            onClick={onClose}
            aria-label="Cerrar vista previa"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </header>
        <div className="evidence-preview-content">
          {errorImagen ? (
            <p className="evidence-preview-error" role="alert">
              No se pudo cargar la imagen de evidencia. Cierra esta ventana e
              inténtalo más tarde.
            </p>
          ) : (
            <img
              src={url}
              alt={`Evidencia adjunta de ${title}`}
              onError={() => setErrorImagen(true)}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function EditarEventoForm({ evento, subtareas = [], onCancelar, onGuardado }) {
  const responsable = typeof evento?.usuario_responsable === "object" ? evento.usuario_responsable?.nombre : evento?.usuario_responsable;
  const [formulario, setFormulario] = useState({
    titulo: evento?.titulo || "",
    fecha: String(evento?.fecha || "").slice(0, 10),
    horas: evento?.horas ?? "",
    usuario_responsable: responsable || "",
    descripcion: evento?.descripcion || "",
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [advertenciaFecha, setAdvertenciaFecha] = useState(null);

  const fechaActual = String(evento?.fecha || "").slice(0, 10);

  const guardar = async () => {
    setGuardando(true);
    setErrorServidor("");
    try {
      await actualizarEvento(evento.id, {
        titulo: formulario.titulo.trim(),
        fecha: formulario.fecha,
        horas: Number(formulario.horas),
        usuario_responsable: formulario.usuario_responsable.trim(),
        descripcion: formulario.descripcion.trim() || null,
      });
      setAdvertenciaFecha(null);
      onGuardado();
    } catch (error) {
      setErrorServidor(error.message);
      setGuardando(false);
    }
  };

  const detectarAdvertenciaFecha = () => {
    if (formulario.fecha === fechaActual || subtareas.length === 0) {
      return null;
    }

    const subtareasAfectadasActual = subtareas.filter(
      (subtarea) =>
        String(subtarea.dia_objetivo || "").slice(0, 10) > formulario.fecha
    );

    if (subtareasAfectadasActual.length === 0) {
      return null;
    }

    return {
      fecha_anterior: fechaActual,
      fecha_nueva: formulario.fecha,
      limite_horas: 0,
      horas_asignadas: 0,
      exceso_horas: 0,
      horas_disponibles: 0,
      fecha_recomendada: undefined,
      agenda: subtareasAfectadasActual.map((subtarea) => ({
        id: subtarea.id,
        titulo: obtenerTituloSubtarea(subtarea),
        evento: `Programada para el ${formatearFecha(subtarea.dia_objetivo)}`,
        horas_estimadas: obtenerHoras(subtarea),
      })),
    };
  };

  const actualizar = (event) => {
    const { name, value } = event.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
  };

  const validar = () => {
    const next = {};

    if (!formulario.titulo.trim()) {
      next.titulo = "Se requiere titulo";
    }

    const hoy = obtenerFechaLocalHoy();

    if (!formulario.fecha) {
      next.fecha = "La fecha del evento es requerida.";
    } else if (formulario.fecha < hoy) {
      next.fecha = "La fecha del evento no puede ser anterior a hoy.";
    }

    const horas = Number(formulario.horas);

    if (
      !formulario.horas ||
      horas <= 0
    ) {
      next.horas = "La duración debe ser mayor a 0 minutos.";
    } else if (horas > 24) {
      next.horas = "Las horas no pueden ser mayores a 24.";
    }

    if (!formulario.usuario_responsable.trim()) {
      next.usuario_responsable = "El usuario responsable es requerido.";
    }

    return next;
  };

  const enviar = async (event) => {
    event.preventDefault();
    const next = validar();
    setErrores(next);
    if (Object.keys(next).length) return;

    const advertencia = detectarAdvertenciaFecha();

    if (advertencia) {
      setAdvertenciaFecha(advertencia);
      return;
    }

    await guardar();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="edit-titulo">Título del evento <span>*</span></label></div>
      <input id="edit-titulo" name="titulo" value={formulario.titulo} onChange={actualizar} aria-invalid={Boolean(errores.titulo)} autoFocus />
      {errores.titulo && <p className="inline-error" role="alert">{errores.titulo}</p>}
      <div className="form-two-columns">
        <div>
          <div className="field-header"><label htmlFor="edit-fecha">Fecha del evento <span>*</span></label></div>
          <input
            id="edit-fecha"
            name="fecha"
            type="date"
            min={obtenerFechaLocalHoy()}
            value={formulario.fecha}
            onChange={actualizar}
            aria-invalid={Boolean(errores.fecha)}
          />
          {errores.fecha ? (
            <p className="inline-error" role="alert">{errores.fecha}</p>
          ) : (
            <p className="helper">ⓘ La fecha debe ser hoy o una fecha futura</p>
          )}
        </div>
        <div>
          <div className="field-header"><label htmlFor="edit-horas-hours">Duración estimada <span>*</span></label></div>
          <DurationInput
            id="edit-horas"
            name="horas"
            value={formulario.horas}
            onChange={actualizar}
            ariaInvalid={Boolean(errores.horas)}
          />
          {errores.horas ? (
            <p className="inline-error" role="alert">{errores.horas}</p>
          ) : (
            <p className="helper">ⓘ Ingresa horas y minutos (máximo 24h)</p>
          )}
        </div>
      </div>
      <div className="field-header">
        <label htmlFor="edit-responsable">
          Usuario responsable <span>*</span>
        </label>
        <small>Obligatorio</small>
      </div>

      <input
        id="edit-responsable"
        name="usuario_responsable"
        value={formulario.usuario_responsable}
        onChange={actualizar}
        aria-invalid={Boolean(errores.usuario_responsable)}
      />

      {errores.usuario_responsable && (
        <p className="inline-error" role="alert">
          {errores.usuario_responsable}
        </p>
      )}
      <div className="field-header"><label htmlFor="edit-descripcion">Descripción</label></div>
      <textarea id="edit-descripcion" name="descripcion" value={formulario.descripcion} onChange={actualizar} />
      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible actualizar el evento.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={guardando}>{guardando && <span className="mini-spinner" />}{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </div>
      {advertenciaFecha && (
        <ModalResolucionSobrecarga
          conflicto={advertenciaFecha}
          titulo="Cambiar la fecha del evento"
          descripcion={`Si continúas, cambiará la fecha del evento, pero las subtareas conservarán sus fechas actuales.`}
          etiquetaDesglose={
            advertenciaFecha.agenda.length > 0
              ? "SUBTAREAS QUE CONSERVARÁN SU FECHA"
              : ""
          }
          mostrarCapacidad={false}
          permitirResolucion={false}
          etiquetaAccion="Continuar"
          guardando={guardando}
          onCancelar={() => setAdvertenciaFecha(null)}
          onAccion={guardar}
        />
      )}
    </form>
  );
}

function EditarSubtareaForm({ subtarea, eventoId, eventoFecha, eventoTitulo, onCancelar, onGuardado }) {
  const [form, setForm] = useState({
    nombre: subtarea?.titulo ?? subtarea?.nombre ?? "",
    horas: subtarea?.horas_estimadas ?? subtarea?.horas ?? "",
    estado: normalizarEstado(subtarea?.estado),
    dia_objetivo: limitarFechaSubtarea(
      subtarea?.dia_objetivo || eventoFecha,
      eventoFecha
    ),
    // La nota ya guardada se precarga; si la API falla permanece en el
    // estado local y no se pierde.
    notas: obtenerNotaSubtarea(subtarea),
    responsable: obtenerResponsableSubtarea(subtarea),
  });

  // La nota crece automáticamente a medida que el usuario escribe.
  const notaRef = useRef(null);
  const expandirNota = () => {
    const elemento = notaRef.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  };

  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [conflicto, setConflicto] = useState(null);

  const actualizar = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrores((prev) => ({
      ...prev,
      [name]: "",
    }));

    setErrorServidor("");
  };

  const cargarAgendaYCapacidad = async () => {
    const [subtareasData, hoyData, eventosData] = await Promise.all([
      obtenerSubtareas(),
      obtenerHoy(),
      obtenerEventos(),
    ]);

    // La API de subtareas devuelve evento_id, pero no necesariamente incluye
    // el objeto evento completo. Enriquecemos cada subtarea con su evento para
    // que los modales de conflicto puedan mostrar el nombre correcto.
    const eventos = Array.isArray(eventosData) ? eventosData : [];
    const eventosPorId = new Map(eventos.map((evento) => [String(evento.id), evento]));
    const agenda = (Array.isArray(subtareasData) ? subtareasData : [])
      .map((item) => ({
        ...item,
        evento: eventosPorId.get(String(item.evento_id)) || null,
        evento_titulo: eventosPorId.get(String(item.evento_id))?.titulo || null,
        fechaObjetivo: item.dia_objetivo || null,
      }))
      .filter((item) => normalizarEstado(item.estado) !== "hecho");

    const limite = Number(hoyData?.resumen?.limite_horas_dia);
    const capacidadDiaria =
      Number.isInteger(limite) && limite > 0 ? limite : 6;

    return { agenda, capacidadDiaria };
  };

  // Guarda la edicion comprobando antes la capacidad del dia. Si la solucion no
  // cabe devuelve el conflicto en lugar de guardar, para que el modal pueda
  // pedir una decision concreta; una subtarea en estado "hecho" no consume
  // jornada y por eso queda fuera de la comprobacion.
  const guardarConValidacionLocal = async ({ fecha, horas }) => {
    const titulo = form.nombre.trim();
    // "Vencida" es una etiqueta derivada: la columna `estado` solo admite
    // pendiente/pospuesto/hecho, así que se persiste como "pendiente".
    const estadoAGuardar = normalizarEstadoAGuardar(form.estado);

    if (normalizarEstado(estadoAGuardar) !== "hecho") {
      const { agenda, capacidadDiaria } = await cargarAgendaYCapacidad();

      // excluirId saca del calculo la subtarea que se esta editando, para no
      // contar dos veces sus propias horas.
      const conflictoCapacidad = construirConflictoSobrecarga({
        agenda,
        fecha,
        horas,
        capacidadDiaria,
        excluirId: subtarea.id,
        fechaLimite: obtenerFechaLimiteSubtarea(eventoFecha),
        titulo,
        eventoTitulo: eventoTitulo || eventosPorId.get(String(eventoId))?.titulo || "Evento sin título",
        idSubtareaCausa: subtarea.id,
      });

      if (conflictoCapacidad) {
        return { guardada: false, ...conflictoCapacidad };
      }
    }

    await actualizarSubtarea(subtarea.id, {
      evento_id: eventoId,
      titulo,
      dia_objetivo: fecha,
      horas_estimadas: Number(horas),
      estado: estadoAGuardar,
      notas: form.notas.trim() || null,
      responsable: form.responsable.trim() || null,
    });

    return { guardada: true };
  };

  const guardarEdicion = async ({ fecha, horas }) => {
    // Estos valores deben calcularse en el mismo alcance donde se usan al
    // actualizar la interfaz después de guardar.
    const titulo = form.nombre.trim();
    const estadoAGuardar = normalizarEstadoAGuardar(form.estado);

    setGuardando(true);
    setErrorServidor("");

    try {
      const resultado = await guardarConValidacionLocal({ fecha, horas });

      if (!resultado.guardada) {
        setGuardando(false);
        setConflicto(resultado);
        return;
      }

      setConflicto(null);
      onGuardado({
        id: subtarea.id,
        titulo,
        nombre: titulo,
        dia_objetivo: fecha,
        horas_estimadas: Number(horas),
        estado: estadoAGuardar,
        responsable: form.responsable.trim() || null,
        notas: form.notas.trim() || null,
      });
    } catch (error) {
      console.error("Error al actualizar subtarea:", error);

      setErrorServidor(
        error?.message || "No fue posible actualizar la subtarea."
      );

      setGuardando(false);
    }
  };

  const enviar = async (event) => {
    event.preventDefault();

    const next = {};

    if (!form.nombre.trim()) {
      next.nombre = "El nombre de la subtarea es requerido.";
    }

    if (
      !form.horas ||
      Number(form.horas) <= 0 ||
      Number(form.horas) > 24
    ) {
      next.horas = "La duración debe ser mayor a 0 minutos y hasta 24 horas.";
    }
    if (
      !esFechaSubtareaValida(form.dia_objetivo, eventoFecha)
    ) {
      next.dia_objetivo =
        "Selecciona una fecha límite entre hoy y la fecha del evento.";
    }
    setErrores(next);

    if (Object.keys(next).length) {
      return;
    }

    await guardarEdicion({
      fecha: form.dia_objetivo,
      horas: Number(form.horas),
    });
  };

  // Aplica la solucion elegida en el modal. Se vuelve a validar con los valores
  // definitivos: la carga del dia puede haber cambiado y la propuesta seguir sin
  // caber, en cuyo caso el conflicto se reconstruye y se muestra de nuevo.
  const aplicarDecisionSobrecarga = async ({ fecha, horas }) => {
    if (!esFechaSubtareaValida(fecha, eventoFecha)) {
      setErrores((prev) => ({
        ...prev,
        dia_objetivo:
          "Selecciona una fecha límite entre hoy y la fecha del evento.",
      }));
      setConflicto(null);
      return;
    }

    await guardarEdicion({ fecha, horas });
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header">
        <label htmlFor="edit-sub-nombre">
          Nombre de la subtarea <span>*</span>
        </label>
      </div>

      <input
        id="edit-sub-nombre"
        name="nombre"
        value={form.nombre}
        onChange={actualizar}
        aria-invalid={Boolean(errores.nombre)}
        autoFocus
      />

      {errores.nombre && (
        <p className="inline-error" role="alert">
          {errores.nombre}
        </p>
      )}

      <div className="form-two-columns">
        <div>
          <div className="field-header">
            <label htmlFor="edit-sub-horas-hours">
              Duración estimada <span>*</span>
            </label>
          </div>

          <DurationInput
            id="edit-sub-horas"
            name="horas"
            value={form.horas}
            onChange={actualizar}
            ariaInvalid={Boolean(errores.horas)}
          />

          {errores.horas && (
            <p className="inline-error" role="alert">
              {errores.horas}
            </p>
          )}
        </div>

        <div>
          <div className="field-header">
            <label htmlFor="edit-sub-estado">
              Estado
            </label>
          </div>

          <select
            id="edit-sub-estado"
            name="estado"
            value={form.estado}
            onChange={actualizar}
          >
            {ESTADOS_EDITABLES.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-header">
        <label htmlFor="edit-sub-dia-objetivo">
          Fecha límite <span>*</span>
        </label>
      </div>

      <input
        id="edit-sub-dia-objetivo"
        name="dia_objetivo"
        type="date"
        min={obtenerFechaLocalHoy()}
        max={eventoFecha}
        value={form.dia_objetivo}
        onChange={actualizar}
        disabled={!eventoFecha || eventoFecha < obtenerFechaLocalHoy()}
        aria-invalid={Boolean(errores.dia_objetivo)}
      />
      <p className="helper">Selecciona entre hoy y la fecha del evento.</p>

      {errores.dia_objetivo && (
        <p className="inline-error" role="alert">
          {errores.dia_objetivo}
        </p>
      )}

      <StitchOptionalSection
        id="edit-sub-responsable"
        icon={<FaUser />}
        title="Asignar responsable"
        defaultOpen={Boolean(form.responsable)}
      >
        <label htmlFor="edit-sub-responsable-input">Responsable de la subtarea</label>
        <input id="edit-sub-responsable-input" name="responsable" value={form.responsable} onChange={actualizar} placeholder="Nombre de la persona responsable" />
      </StitchOptionalSection>

      <StitchOptionalSection
        id="edit-sub-notas"
        icon={<FaRegFileAlt />}
        title="Agregar nota"
        defaultOpen
      >
        <label htmlFor="edit-sub-notas-textarea">Notas e instrucciones</label>
        <textarea
          id="edit-sub-notas-textarea"
          name="notas"
          ref={notaRef}
          value={form.notas}
          onChange={actualizar}
          onInput={expandirNota}
          rows={1}
          maxLength={300}
          placeholder="Añade una nota (opcional)"
        />
        <p className="helper">Se guarda al editar.</p>
      </StitchOptionalSection>

      {errorServidor && (
        <div className="alert alert-error" role="alert">
          <b>No fue posible actualizar la subtarea.</b>
          <span>{errorServidor}</span>
        </div>
      )}

      <div className="actions">
        <button
          className="btn ghost"
          type="button"
          onClick={onCancelar}
          disabled={guardando}
        >
          Cancelar
        </button>

        <button
          className="btn primary"
          type="submit"
          disabled={guardando}
        >
          {guardando && <span className="mini-spinner" />}
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      {conflicto && (
        <ModalResolucionSobrecarga
          key={`${conflicto.id_subtarea_causa}-${conflicto.fecha_objetivo}-${conflicto.horas_asignadas}-${conflicto.exceso_horas}-${conflicto.horas_otras ?? ""}-${conflicto.fecha_recomendada || ""}`}
          conflicto={conflicto}
          titulo="Límite de jornada excedido"
          descripcion={`La subtarea supera la capacidad diaria configurada para el ${formatearFecha(conflicto.fecha_objetivo)}.`}
          horasCausa={Number(form.horas)}
          tituloCausa={form.nombre.trim()}
          guardando={guardando}
          onCancelar={() => setConflicto(null)}
          onAccion={aplicarDecisionSobrecarga}
        />
      )}
    </form>
  );
}
function Eventos({ eventos, cargando, error, recargar, crear, busqueda }) {
  const termino = busqueda.trim().toLocaleLowerCase("es");
  const eventosVisibles = eventos.filter((evento) =>
    `${evento.titulo || ""} ${evento.descripcion || ""}`
      .toLocaleLowerCase("es")
      .includes(termino)
  );

  return (
    <section className="page">
      <div className="heading">
        <div><small>PLANIFICACIÓN</small><h1>Eventos</h1><p>Gestiona tus eventos y organiza las tareas necesarias para completarlos.</p></div>      </div>

      {cargando && <section className="card state-card"><span className="spinner" /> Cargando eventos...</section>}
      {!cargando && error && <section className="card state-card error-state" role="alert"><div><b>No se pudieron cargar los eventos.</b><p>{error}</p></div><button className="btn ghost" onClick={recargar}>Reintentar</button></section>}
      {!cargando && !error && eventos.length === 0 && <section className="card empty-state"><div className="empty-icon">✦</div><h2>Aún no hay eventos</h2><p>¿Deseas crear tu primer evento?</p><button className="btn primary" onClick={crear}>Crear el primer evento</button></section>}
      {!cargando && !error && eventos.length > 0 && eventosVisibles.length === 0 && <section className="card empty-state"><div className="empty-icon">⌕</div><h2>No se encontraron eventos</h2><p>Prueba con otro nombre.</p></section>}
      {!cargando && !error && eventosVisibles.length > 0 && <section className="event-grid" aria-label="Eventos guardados">
        {eventosVisibles.map((evento) => <article className="event-card card" key={evento.id ?? `${evento.titulo}-${evento.fecha}`}>
          <div className="event-card-icon">✦</div>
          <div className="event-card-content"><span className="status-pill">● En preparación</span><h2>{evento.titulo}</h2><p>{formatearFecha(evento.fecha)} {evento.horas ? `• ${formatearDuracion(evento.horas)}` : ""}</p>{evento.descripcion && <p className="muted-line">{evento.descripcion}</p>}</div>
          <button className="btn secondary" onClick={() => navegar(`/eventos/${evento.id}`)}>Ver detalle</button>
        </article>)}
      </section>}
    </section>
  );
}

function DetalleEvento({ id, volver, onNotify, onEventosChanged }) {
  const [evento, setEvento] = useState(null);
  const [cargandoEvento, setCargandoEvento] = useState(true);
  const [errorEvento, setErrorEvento] = useState("");
  const [subtareas, setSubtareas] = useState([]);
  const [estadoSubtareas, setEstadoSubtareas] = useState("loading");
  const [errorSubtareas, setErrorSubtareas] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [actualizandoEstadoSubtarea, setActualizandoEstadoSubtarea] = useState(null);
  const [conflictoCheckbox, setConflictoCheckbox] = useState(null);
  const [evidenciaAbierta, setEvidenciaAbierta] = useState(null);

  const cargar = async () => {
    setCargandoEvento(true); setErrorEvento("");
    try { setEvento(await obtenerEvento(id)); }
    catch (error) { setErrorEvento(error.message); }
    finally { setCargandoEvento(false); }
  };
  const cargarSubtareas = async () => {
    setEstadoSubtareas("loading"); setErrorSubtareas("");
    try {
      const data = await obtenerSubtareas(id);
      const lista = Array.isArray(data) ? data : [];

      // Orden cronológico por fecha objetivo. Ante el mismo día se
      // desempata por horas (menor esfuerzo primero) y, si empatan, por
      // título: así el listado es estable y reproducible entre recargas.
      const ordenadas = lista.slice().sort((a, b) => {
        const fechaA = String(a.dia_objetivo || "").slice(0, 10);
        const fechaB = String(b.dia_objetivo || "").slice(0, 10);

        if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);

        const horasA = obtenerHoras(a);
        const horasB = obtenerHoras(b);

        if (horasA !== horasB) return horasA - horasB;

        return obtenerTituloSubtarea(a).localeCompare(
          obtenerTituloSubtarea(b),
          "es"
        );
      });

      setSubtareas(ordenadas);
      setEstadoSubtareas(lista.length ? "success" : "empty");
    } catch (error) { setErrorSubtareas(error.message); setEstadoSubtareas("error"); }
  };
  useEffect(() => { cargar(); cargarSubtareas(); }, [id]);

  const completadas = subtareas.filter((item) => normalizarEstado(item.estado) === "hecho").length;
  const horasRegistradas = subtareas.reduce((total, item) => total + obtenerHoras(item), 0);
  const porcentaje = subtareas.length ? Math.round((completadas / subtareas.length) * 100) : 0;
  const responsable = evento?.usuario_responsable;
  const responsableTexto =
    typeof responsable === "object"
      ? responsable?.nombre
      : responsable;

  const alternarEstadoSubtarea = async (task) => {
    if (!task?.id || actualizandoEstadoSubtarea !== null || conflictoCheckbox) return;

    // Al desmarcar una tarea hecha, primero se valida la capacidad diaria.
    // Si genera sobrecarga, se abre el modal de resolución existente y no se
    // cambia el estado hasta que el usuario elija una solución válida.
    const estadoActual = normalizarEstado(task.estado);
    const estadoNuevo = estadoActual === "hecho" ? "pendiente" : "hecho";

    if (estadoNuevo === "pendiente") {
      setActualizandoEstadoSubtarea(task.id);
      try {
        const [subtareasData, hoyData, eventosData] = await Promise.all([
          obtenerSubtareas(),
          obtenerHoy(),
          obtenerEventos(),
        ]);
        const eventosPorId = new Map(
          (Array.isArray(eventosData) ? eventosData : []).map((evento) => [String(evento.id), evento])
        );
        const agenda = (Array.isArray(subtareasData) ? subtareasData : [])
          .filter((item) => normalizarEstado(item.estado) !== "hecho")
          .map((item) => ({
            ...item,
            evento: eventosPorId.get(String(item.evento_id)) || null,
            evento_titulo: eventosPorId.get(String(item.evento_id))?.titulo || null,
            fechaObjetivo: item.dia_objetivo || null,
          }));
        const limiteRaw = Number(hoyData?.resumen?.limite_horas_dia);
        const capacidadDiaria = Number.isFinite(limiteRaw) && limiteRaw > 0 ? limiteRaw : 6;
        const fecha = String(task.dia_objetivo || "").slice(0, 10);
        const conflictoDetectado = construirConflictoSobrecarga({
          agenda,
          fecha,
          horas: obtenerHoras(task),
          capacidadDiaria,
          excluirId: task.id,
          fechaLimite: obtenerFechaLimiteSubtarea(evento?.fecha),
          titulo: obtenerTituloSubtarea(task),
          eventoTitulo: evento?.titulo || "Evento sin título",
          idSubtareaCausa: task.id,
        });

        if (conflictoDetectado) {
          setConflictoCheckbox({ conflicto: conflictoDetectado, tarea: task });
          return;
        }
      } catch (error) {
        onNotify(error.message || "No se pudo comprobar la capacidad diaria.", "error");
        return;
      } finally {
        setActualizandoEstadoSubtarea(null);
      }
    }

    setActualizandoEstadoSubtarea(task.id);
    try {
      await actualizarParcialSubtarea(task.id, { estado: estadoNuevo });
      await cargarSubtareas();
      onEventosChanged?.();
      onNotify(estadoNuevo === "hecho"
        ? "Subtarea marcada como hecha correctamente."
        : "Subtarea marcada como pendiente correctamente.");
    } catch (error) {
      await cargarSubtareas();
      onNotify(error.message || "No se pudo actualizar el estado de la tarea.", "error");
    } finally {
      setActualizandoEstadoSubtarea(null);
    }
  };

  const resolverConflictoCheckbox = async ({ fecha, horas }) => {
    const pendiente = conflictoCheckbox;
    if (!pendiente?.tarea?.id) return;
    setActualizandoEstadoSubtarea(pendiente.tarea.id);
    try {
      await actualizarParcialSubtarea(pendiente.tarea.id, {
        estado: "pendiente",
        dia_objetivo: fecha,
        horas_estimadas: Number(horas),
      });
      setConflictoCheckbox(null);
      await cargarSubtareas();
      onEventosChanged?.();
      onNotify("Conflicto resuelto. La subtarea quedó pendiente con la planificación actualizada.");
    } catch (error) {
      onNotify(error.message || "No se pudo aplicar la resolución del conflicto.", "error");
    } finally {
      setActualizandoEstadoSubtarea(null);
    }
  };

  const eventoActualizado = async () => {
    setModal(null); await cargar(); onEventosChanged?.(); onNotify("Evento actualizado correctamente");
  };
  const subtareaActualizada = async (datosActualizados) => {
    setModal(null);
    try {
      const data = await obtenerSubtareas(id);
      const lista = Array.isArray(data) ? data : [];
      const listaConDatosActualizados = lista.map((item) => {
        if (String(item.id) !== String(datosActualizados?.id)) return item;
        return {
          ...item,
          ...datosActualizados,
          responsable: datosActualizados.responsable ?? obtenerResponsableSubtarea(item),
          notas: datosActualizados.notas ?? obtenerNotaSubtarea(item),
        };
      });
      setSubtareas(listaConDatosActualizados);
      setEstadoSubtareas(listaConDatosActualizados.length ? "success" : "empty");
      setErrorSubtareas("");
    } catch (error) {
      await cargarSubtareas();
    }
    onNotify("Subtarea actualizada correctamente");
  };
  const ejecutarEliminacion = async () => {
    if (!confirmacion) return;
    setEliminando(true);
    try {
      if (confirmacion.type === "evento") {
        await eliminarEvento(id);
        setConfirmacion(null);
        onNotify("Evento eliminado correctamente");
        onEventosChanged?.();
        volver();
      } else {
        await eliminarSubtarea(confirmacion.item.id);
        setConfirmacion(null);
        await cargarSubtareas();
        onNotify("Subtarea eliminada correctamente");
      }
    } catch (error) {
      setConfirmacion(null);
      onNotify(error.message || "No fue posible eliminar el elemento.", "error");
    } finally { setEliminando(false); }
  };

  if (cargandoEvento) return <section className="page"><div className="breadcrumb">← Volver a la lista general de eventos</div><section className="card state-card"><span className="spinner" /> Cargando detalle del evento...</section></section>;
  if (errorEvento || !evento) return <section className="page"><button className="back-link" onClick={volver}>← Volver a la lista general de eventos</button><section className="card state-card error-state" role="alert"><div><b>No se pudo cargar el evento.</b><p>{errorEvento || "El evento no existe."}</p></div><button className="btn ghost" onClick={cargar}>Reintentar</button></section></section>;

  return (
    <section className="page detail-page">
      <button className="back-link" onClick={volver}>← Volver a la lista general de eventos</button>
      <div className="detail-title-row">
        <div><h1>{evento.titulo}</h1><p>• Información del evento</p></div>
        <div className="title-actions">
          <button className="btn secondary" onClick={() => setModal("edit-event")}><span className="edit-pencil" aria-hidden="true">✎</span> Editar</button>
          <button className="btn danger-outline" onClick={() => setConfirmacion({ type: "evento" })}><FaTrashAlt aria-hidden="true" /> Eliminar</button>
        </div>
      </div>

      <section className="event-info card">
        <InfoBlock icon="fecha" title="FECHA DEL EVENTO"><strong>{formatearFecha(evento.fecha)}</strong><span>Fecha registrada</span></InfoBlock>
        <InfoBlock icon="duracion" title="DURACIÓN ESTIMADA"><strong>{evento.horas == null ? "—" : formatearDuracion(evento.horas)}</strong><span>Jornada estimada</span></InfoBlock>
        <InfoBlock icon="responsable" title="USUARIO RESPONSABLE"><strong>{responsableTexto || "Sin asignar"}</strong><span>Responsable</span></InfoBlock>
        <InfoBlock icon="descripcion" title="DESCRIPCIÓN COMPLETA"><strong className="description-value">{evento.descripcion || "Sin descripción"}</strong></InfoBlock>
      </section>

      <div className="subtasks-heading"><div><h2>Subtareas</h2><p>Organiza las tareas necesarias para completar este evento.</p></div><button className="btn primary" onClick={() => setModal("create-subtask")}>＋ Nueva subtarea</button></div>
      <section className="subtask-section card">
        <div className="section-tabs"><span className="tab active">Con subtareas ({subtareas.length})</span></div>
        {estadoSubtareas === "loading" && <div className="state-inside"><span className="spinner" /> Cargando subtareas...</div>}
        {estadoSubtareas === "error" && <div className="state-inside error-inside" role="alert"><div><b>Error cargando las subtareas</b><p>{errorSubtareas}</p></div><button className="btn ghost" onClick={cargarSubtareas}>Reintentar</button></div>}
        {estadoSubtareas === "empty" && <div className="empty-subtasks"><div className="empty-icon">✦</div><h3>Aún no hay subtareas</h3><p>Agrega una subtarea para organizar este evento.</p><button className="btn primary" onClick={() => setModal("create-subtask")}>＋ Nueva subtarea</button></div>}
        {estadoSubtareas === "success" && <div className="subtask-list">
          {subtareas.map((task) => {
            const estado = normalizarEstado(task.estado);
            const titulo = obtenerTituloSubtarea(task);
            const nota = obtenerNotaSubtarea(task);
            const responsableSubtarea = obtenerResponsableSubtarea(task);
            const evidenciaUrl =
              typeof task.comprobante_url === "string"
                ? task.comprobante_url.trim()
                : "";
            return <article className="subtask-row" key={task.id ?? `${titulo}-${obtenerHoras(task)}`}>
              <div className="subtask-row-controls">
                <button
                  type="button"
                  className={`task-check ${estado === "hecho" ? "completed" : ""}`}
                  role="checkbox"
                  aria-checked={estado === "hecho"}
                  aria-label={estado === "hecho" ? `Marcar ${titulo} como pendiente` : `Marcar ${titulo} como hecha`}
                  title={estado === "hecho" ? "Desmarcar y volver a pendiente" : "Marcar como hecha"}
                  disabled={actualizandoEstadoSubtarea === task.id}
                  onClick={() => alternarEstadoSubtarea(task)}
                >
                  {actualizandoEstadoSubtarea === task.id ? <span className="mini-spinner" aria-label="Guardando" /> : estado === "hecho" ? "✓" : ""}
                </button>
                {evidenciaUrl && (
                  <button
                    type="button"
                    className="subtask-evidence-trigger"
                    aria-label={`Ver evidencia adjunta de ${titulo}`}
                    title="Ver evidencia adjunta"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEvidenciaAbierta({ url: evidenciaUrl, titulo });
                    }}
                  >
                    <FaPaperclip aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="task-main">
                <h3 className={estado === "hecho" ? "completed-text" : ""}>{titulo}</h3>
                <p>📅 {formatearFecha(task.dia_objetivo)} • ◷ {formatearDuracion(obtenerHoras(task))}{nota && <span className="subtask-note"> · Nota: {nota}</span>}</p>
                {responsableSubtarea && <p className="subtask-responsible">Responsable: {responsableSubtarea}</p>}
              </div>
              <div className="subtask-status">
                <span className={`badge ${claveBadgeEstado(task)}`}>{etiquetaBadgeEstado(task)}</span>
              </div>
              <div className="row-actions"><button className="btn ghost" onClick={() => setModal({ type: "edit-subtask", item: task })}><span className="edit-pencil" aria-hidden="true">✎</span> Editar</button><button className="btn danger-outline" onClick={() => setConfirmacion({ type: "subtarea", item: task })}><FaTrashAlt aria-hidden="true" /> Eliminar</button></div>
            </article>;
          })}
        </div>}
      </section>

      <section className="progress-card card"><div className="progress-icon">✓</div><div><h2>Progreso global de subtareas</h2><p>{subtareas.length === 0 ? "Sin gestiones registradas (0%)." : `${completadas} de ${subtareas.length} completadas (${porcentaje}%) • ${formatearDuracion(horasRegistradas)} totales registradas`}</p></div><strong>{porcentaje}%</strong><div className="progress-track" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso global de subtareas"><span style={{ width: `${porcentaje}%` }} /></div></section>

      {modal === "create-subtask" && <Modal title="Crear subtarea" subtitle="Agrega una nueva tarea para este evento." close={() => setModal(null)}><CrearSubtareaForm eventoId={id} eventoFecha={evento.fecha} eventoTitulo={evento.titulo} onCancelar={() => setModal(null)} onCreada={async () => { setModal(null); onNotify("Subtarea creada correctamente"); await cargarSubtareas(); }} /></Modal>}
      {modal === "edit-event" && <Modal title="Editar evento" subtitle="Actualiza la información del evento." close={() => setModal(null)} wide><EditarEventoForm evento={evento} subtareas={subtareas} onCancelar={() => setModal(null)} onGuardado={eventoActualizado} /></Modal>}
      {modal?.type === "edit-subtask" && <Modal title="Editar subtarea" subtitle="Actualiza la información de la subtarea." close={() => setModal(null)}><EditarSubtareaForm subtarea={modal.item} eventoId={id} eventoFecha={evento.fecha} eventoTitulo={evento.titulo} onCancelar={() => setModal(null)} onGuardado={subtareaActualizada} /></Modal>}
      {confirmacion?.type === "evento" && <ConfirmModal title="¿Eliminar evento?" message="Esta acción eliminará el evento y sus subtareas. No se puede deshacer." close={() => setConfirmacion(null)} onConfirm={ejecutarEliminacion} loading={eliminando} />}
      {confirmacion?.type === "subtarea" && <ConfirmModal title="¿Eliminar subtarea?" message={`Esta acción eliminará “${obtenerTituloSubtarea(confirmacion.item)}”. No se puede deshacer.`} close={() => setConfirmacion(null)} onConfirm={ejecutarEliminacion} loading={eliminando} />}
      {evidenciaAbierta && (
        <EvidencePreviewModal
          url={evidenciaAbierta.url}
          title={evidenciaAbierta.titulo}
          onClose={() => setEvidenciaAbierta(null)}
        />
      )}
      {conflictoCheckbox && (
        <ModalResolucionSobrecarga
          key={`checkbox-${conflictoCheckbox.tarea.id}-${conflictoCheckbox.conflicto.fecha_objetivo}-${conflictoCheckbox.conflicto.horas_asignadas}`}
          conflicto={conflictoCheckbox.conflicto}
          horasCausa={obtenerHoras(conflictoCheckbox.tarea)}
          tituloCausa={obtenerTituloSubtarea(conflictoCheckbox.tarea)}
          titulo="Límite de jornada excedido"
          descripcion={`Al volver a poner esta subtarea como pendiente, superarías la capacidad diaria configurada para el ${formatearFecha(conflictoCheckbox.conflicto.fecha_objetivo)}.`}
          guardando={actualizandoEstadoSubtarea === conflictoCheckbox.tarea.id}
          onCancelar={() => setConflictoCheckbox(null)}
          onAccion={resolverConflictoCheckbox}
        />
      )}
    </section>
  );
}

function InfoBlock({ icon, title, children }) {
  return (
    <div className="info-block">
      <span className="info-icon">
        {icon === "fecha" && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="3" />
            <path d="M8 2v4M16 2v4M3 9h18" />
            <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
          </svg>
        )}

        {icon === "duracion" && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        )}

        {icon === "responsable" && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c.8-3.4 3.2-5 7-5s6.2 1.6 7 5" />
          </svg>
        )}

        {icon === "descripcion" && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h9l4 4v14H6z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
        )}
      </span>

      <div>
        <small>{title}</small>
        {children}
      </div>
    </div>
  );
}

function CrearEventoPage({ onCancelar, onCrear }) {
  const [progreso, setProgreso] = useState({
    porcentaje: 0,
    pasosCompletados: 0,
    pasos: [false, false, false, false],
  });

  const pasos = [
    {
      titulo: "Nombre y temática principal",
      descripcion: "Título claro para identificar el evento.",
    },
    {
      titulo: "Fecha fijada",
      descripcion: "Selecciona una fecha para reservar.",
    },
    {
      titulo: "Horas estimadas de ejecución",
      descripcion: "Indica una duración entre 1 y 24 horas.",
    },
    {
      titulo: "Usuario responsable",
      descripcion: "Asigna la persona responsable del evento.",
    },
  ];

  return (
    <section className="create-page">
      <div className="create-main">
        <button className="back-link" onClick={onCancelar}>← Volver a Eventos <span className="back-dot">•</span> <span className="draft-pill">◉ Borrador</span></button>
        <div className="create-heading">
          <div>
            <h1>Crear evento</h1>
            <p>Completa la información para crear un nuevo evento.</p>
          </div>
        </div>
        <section className="card create-form-card">
          <FormularioEvento onCancelar={onCancelar} onCrear={onCrear} onProgress={setProgreso} />
        </section>
      </div>
      <aside className="create-sidebar">
        <section className="card progress-register">
          <div className="sidebar-title">
            <span className="sidebar-icon">☷</span>
            <h2>Progreso del Registro</h2>
            <span className="ready-pill">{progreso.porcentaje}% Listo</span>
          </div>

          {pasos.map((paso, index) => {
            const completado = progreso.pasos[index];
            const actual =
              !completado &&
              (index === 0 || progreso.pasos[index - 1]);

            return (
              <div
                className={`register-step ${completado ? "done" : actual ? "current" : ""
                  }`}
                key={paso.titulo}
              >
                <span className="step-dot">
                  {completado ? "✓" : actual ? "○" : "○"}
                </span>
                <div>
                  <b>{paso.titulo}</b>
                  <small>{paso.descripcion}</small>
                </div>
              </div>
            );
          })}

          <div className="register-progress">
            <span style={{ width: `${progreso.porcentaje}%` }} />
          </div>
        </section>

        <section className="card validation-card">
          <div className="validation-title"><span>ⓘ</span><h2>Reglas de validación y publicación</h2></div>
          <p>Al registrar un nuevo evento en el workspace de EventHub:</p>
          <ul>
            <li><b>Título:</b> Debe tener al menos 3 caracteres.</li>
            <li><b>Fecha:</b> Debe ser hoy o una fecha futura.</li>
            <li><b>Duración:</b> Debe ser mayor a 0 minutos y no superar las 24 horas; se ingresa en horas y minutos.</li>
            <li><b>Usuario responsable:</b> Debe indicar la persona responsable del evento.</li>
          </ul>
        </section>


      </aside>
    </section>
  );
}

function ConfiguracionUsuario({ onNotify }) {
  const [horasDia, setHorasDia] = useState(6);
  const [horasGuardadas, setHorasGuardadas] = useState(6);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errorCampo, setErrorCampo] = useState("");
  const [errorPerfil, setErrorPerfil] = useState("");
  const [conflictoConfiguracion, setConflictoConfiguracion] = useState(null);
  const [fotoPerfil, setFotoPerfil] = useState("");
  const [errorFoto, setErrorFoto] = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [mostrarModalFoto, setMostrarModalFoto] = useState(false);
  const [fotoSeleccionada, setFotoSeleccionada] = useState(null);
  const [vistaPreviaFoto, setVistaPreviaFoto] = useState("");
  const inputFotoRef = useRef(null);
  const fotoTriggerRef = useRef(null);
  const vistaPreviaFotoRef = useRef("");
  const [perfilActual, setPerfilActual] = useState(obtenerDatosPerfil);
  const [nombrePerfil, setNombrePerfil] = useState("");
  const [apellidoPerfil, setApellidoPerfil] = useState("");
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  useEffect(() => {
    const cargarConfiguracion = async () => {
      setCargando(true);
      setError("");

      try {
        const data = await obtenerConfiguracionUsuario();

        const horasConfiguradas = Number.isInteger(Number(data?.horas_dia))
          ? Number(data.horas_dia)
          : 6;
        setHorasDia(horasConfiguradas);
        setHorasGuardadas(horasConfiguradas);
      } catch (errorActual) {
        setError(
          errorActual.message ||
          "No fue posible cargar la configuración del usuario."
        );
      } finally {
        setCargando(false);
      }
    };

    cargarConfiguracion();
  }, []);

  useEffect(() => {
    let activo = true;
    const cargarPerfil = async () => {
      const [perfilResultado, fotoResultado] = await Promise.allSettled([
        obtenerPerfilUsuario(),
        obtenerFotoPerfil(),
      ]);
      if (!activo) return;

      if (perfilResultado.status === "fulfilled") {
        const perfilData = perfilResultado.value;
        setNombrePerfil(perfilData?.nombre || "");
        setApellidoPerfil(perfilData?.apellido || "");
        const nombre =
          [perfilData?.nombre, perfilData?.apellido]
            .filter(Boolean)
            .join(" ")
            .trim() || obtenerDatosPerfil().nombre;
        setPerfilActual({
          ...obtenerDatosPerfil(),
          nombre,
          correo: perfilData?.email || obtenerDatosPerfil().correo,
          iniciales: nombre
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte[0]?.toLocaleUpperCase("es-CO") || "")
            .join("") || "EH",
        });
      } else {
        setErrorPerfil(
          perfilResultado.reason?.message ||
            "No fue posible consultar el perfil del usuario."
        );
      }

      if (fotoResultado.status === "fulfilled") {
        setFotoPerfil(fotoResultado.value?.foto_perfil_url || "");
      } else {
        setErrorFoto(
          fotoResultado.reason?.message ||
            "No fue posible consultar tu foto de perfil."
        );
      }
    };

    void cargarPerfil();

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => () => {
    if (vistaPreviaFotoRef.current) {
      URL.revokeObjectURL(vistaPreviaFotoRef.current);
    }
  }, []);

  const cambiarHoras = (event) => {
    const value = event.target.value;

    setHorasDia(value);
    setErrorCampo("");
  };

  const validar = () => {
    const horas = Number(horasDia);

    if (
      horasDia === "" ||
      !Number.isInteger(horas) ||
      horas < 1 ||
      horas > 16
    ) {
      return "Las horas por día deben ser un número entero entre 1 y 16.";
    }

    return "";
  };

  const guardar = async () => {
    const errorValidacion = validar();

    if (errorValidacion) {
      setErrorCampo(errorValidacion);
      return;
    }

    setGuardando(true);
    setError("");
    setErrorCampo("");

    try {
      const nuevasHoras = Number(horasDia);

      if (nuevasHoras < horasGuardadas) {
        const hoyData = await obtenerHoy();
        const fechaHoy = hoyData?.fecha || obtenerFechaLocalHoy();
        const gestionesDeHoy = [
          ...(hoyData?.vencidas || []),
          ...(hoyData?.urgentes || []),
          ...(hoyData?.proximas || []),
        ].filter(
          (tarea) =>
            String(tarea.dia_objetivo || "").slice(0, 10) === fechaHoy
        );

        if (obtenerHorasPendientes(gestionesDeHoy) > nuevasHoras) {
          // Completa los datos desde el endpoint de subtareas para conservar
          // evento_id y todos los campos necesarios para persistir la fecha nueva.
          const todasLasSubtareas = await obtenerSubtareas();
          const subtareasPorId = new Map(
            (Array.isArray(todasLasSubtareas) ? todasLasSubtareas : []).map((item) => [String(item.id), item])
          );
          const agenda = gestionesDeHoy.map((item) => ({
            ...(subtareasPorId.get(String(item.id)) || {}),
            ...item,
            evento_id:
              item.evento_id ??
              item.evento?.id ??
              subtareasPorId.get(String(item.id))?.evento_id ??
              subtareasPorId.get(String(item.id))?.evento?.id ??
              null,
            fechaObjetivo: item.dia_objetivo || null,
          }));

          const detalle = agenda.map((subtarea) => ({
            ...subtarea,
            id: subtarea.id,
            evento_id:
              subtarea.evento_id ??
              subtarea.evento?.id ??
              subtarea.evento?.evento_id ??
              null,
            titulo: obtenerTituloSubtarea(subtarea),
            evento: subtarea.evento?.titulo || subtarea.evento_titulo || "Evento sin título",
            dia_objetivo: subtarea.dia_objetivo || fechaHoy,
            horas_estimadas: obtenerHoras(subtarea),
            estado: normalizarEstadoAGuardar(subtarea.estado),
            notas: obtenerNotaSubtarea(subtarea),
            es_subtarea_reprogramada: false,
          }));

          const horasTotales = obtenerHorasPendientes(gestionesDeHoy);

          setConflictoConfiguracion({
            limite_excedido: true,
            fecha_objetivo: fechaHoy,
            horas_asignadas: horasTotales,
            limite_horas: nuevasHoras,
            exceso_horas: horasTotales - nuevasHoras,
            horas_disponibles: 0,
            horas_causa: 0,
            horas_otras: horasTotales,
            horas_recomendadas: 0,
            fecha_recomendada: null,
            agenda: detalle,
            cargaExistente: (Array.isArray(todasLasSubtareas) ? todasLasSubtareas : [])
              .filter((item) =>
                !gestionesDeHoy.some((gestion) => String(gestion.id) === String(item.id)) &&
                normalizarEstado(item.estado) !== "hecho" &&
                Boolean(String(item.dia_objetivo || "").slice(0, 10))
              )
              .map((item) => ({
                id: item.id,
                fecha: String(item.dia_objetivo).slice(0, 10),
                horas_estimadas: obtenerHoras(item),
              })),
            id_subtarea_causa: null,
          });
          return;
        }
      }

      const data = await actualizarConfiguracionUsuario(nuevasHoras);

      setHorasDia(Number(data.horas_dia));
      setHorasGuardadas(Number(data.horas_dia));

      onNotify("Configuración guardada correctamente.");
    } catch (errorActual) {
      setError(
        errorActual.message ||
        "No fue posible guardar la configuración. Inténtalo de nuevo."
      );
    } finally {
      setGuardando(false);
    }
  };

  const seleccionarFotoPerfil = (archivo) => {
    setErrorFoto("");
    if (!archivo || subiendoFoto) return;
    if (!["image/jpeg", "image/png"].includes(archivo.type)) {
      setFotoSeleccionada(null);
      limpiarVistaPreviaFoto();
      setErrorFoto("Selecciona una imagen JPG o PNG.");
      return;
    }
    if (archivo.size === 0) {
      setFotoSeleccionada(null);
      limpiarVistaPreviaFoto();
      setErrorFoto("El archivo está vacío.");
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setFotoSeleccionada(null);
      limpiarVistaPreviaFoto();
      setErrorFoto("La imagen debe pesar 5 MB o menos.");
      return;
    }

    if (vistaPreviaFotoRef.current) {
      URL.revokeObjectURL(vistaPreviaFotoRef.current);
    }
    const url = URL.createObjectURL(archivo);
    vistaPreviaFotoRef.current = url;
    setVistaPreviaFoto(url);
    setFotoSeleccionada(archivo);
  };

  const limpiarVistaPreviaFoto = useCallback(() => {
    if (vistaPreviaFotoRef.current) {
      URL.revokeObjectURL(vistaPreviaFotoRef.current);
      vistaPreviaFotoRef.current = "";
    }
    setVistaPreviaFoto("");
  }, []);

  const abrirModalFoto = () => {
    setErrorFoto("");
    setFotoSeleccionada(null);
    limpiarVistaPreviaFoto();
    setMostrarModalFoto(true);
  };

  const cerrarModalFoto = useCallback(() => {
    if (subiendoFoto) return;
    setMostrarModalFoto(false);
    setFotoSeleccionada(null);
    setErrorFoto("");
    limpiarVistaPreviaFoto();
    window.requestAnimationFrame(() => fotoTriggerRef.current?.focus());
  }, [subiendoFoto, limpiarVistaPreviaFoto]);

  const guardarFotoPerfil = async () => {
    if (!fotoSeleccionada || subiendoFoto) return;

    setSubiendoFoto(true);
    try {
      const resultado = await subirFotoPerfil(fotoSeleccionada);
      const url = resultado?.foto_perfil_url;
      if (!url) {
        throw new Error("El servidor no devolvió la URL de la foto guardada.");
      }

      setFotoPerfil(url);
      setFotoSeleccionada(null);
      limpiarVistaPreviaFoto();
      setMostrarModalFoto(false);
      window.dispatchEvent(
        new CustomEvent("eventhub-profile-updated", {
          detail: { fotoPerfilUrl: url },
        })
      );
      window.requestAnimationFrame(() => fotoTriggerRef.current?.focus());
      onNotify("Foto de perfil actualizada.");
    } catch (errorActual) {
      setErrorFoto(
        errorActual.message || "No fue posible guardar la foto de perfil."
      );
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardarPerfil = async () => {
    const nombre = nombrePerfil.trim();
    const apellido = apellidoPerfil.trim();
    if (nombre.length < 2 || nombre.length > 100) {
      setErrorPerfil("El nombre debe tener entre 2 y 100 caracteres.");
      return;
    }
    if (apellido.length < 2 || apellido.length > 100) {
      setErrorPerfil("El apellido debe tener entre 2 y 100 caracteres.");
      return;
    }

    setGuardandoPerfil(true);
    setErrorPerfil("");
    try {
      const resultado = await actualizarPerfilUsuario({ nombre, apellido });
      const nombreGuardado = resultado?.nombre?.trim();
      const apellidoGuardado = resultado?.apellido?.trim();
      if (!nombreGuardado || !apellidoGuardado) {
        throw new Error("El servidor no confirmó los datos actualizados.");
      }

      setNombrePerfil(nombreGuardado);
      setApellidoPerfil(apellidoGuardado);
      const nombreCompleto = `${nombreGuardado} ${apellidoGuardado}`;
      setPerfilActual((actual) => ({
        ...actual,
        nombre: nombreCompleto,
        correo: resultado.email || actual.correo,
        iniciales: `${nombreGuardado[0]}${apellidoGuardado[0]}`.toLocaleUpperCase("es-CO"),
      }));
      window.dispatchEvent(
        new CustomEvent("eventhub-profile-updated", {
          detail: { nombre: nombreGuardado, apellido: apellidoGuardado },
        })
      );
      onNotify("Nombre y apellido actualizados correctamente.");
    } catch (errorActual) {
      setErrorPerfil(
        errorActual.message || "No fue posible actualizar el perfil."
      );
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const ajustarHoras = (cambio) => {
    const actual = Number(horasDia);
    const base = Number.isFinite(actual) ? actual : 1;
    const siguiente = Math.min(16, Math.max(1, base + cambio));
    setHorasDia(String(siguiente));
    setErrorCampo("");
  };

  const cancelarCambios = () => {
    setHorasDia(horasGuardadas);
    setErrorCampo("");
    navegar("/eventos");
  };

  return (
    <section className="page configuration-page">
      <div className="configuration-breadcrumb" aria-label="Ruta de navegación">
        <span>EventHub</span><span aria-hidden="true">/</span><strong>Configuración</strong>
      </div>

      <div className="configuration-header">
        <div>
          <h1>Configuración</h1>
          <p>Administra tu perfil y tu jornada de trabajo.</p>
        </div>
      </div>

      {cargando ? (
        <section className="card state-card">
          <span className="spinner" />
          Consultando tu configuración...
        </section>
      ) : (
        <div className="profile-settings-form">
          {error && (
            <section className="card state-card error-state" role="alert">
              <div>
                <b>No se pudo cargar o guardar el límite diario.</b>
                <p>{error}</p>
              </div>
            </section>
          )}
          <section className="card configuration-card profile-data-card">
            <div className="settings-section-heading">
              <button
                ref={fotoTriggerRef}
                className="settings-section-icon profile-photo-icon-trigger"
                type="button"
                aria-label="Cambiar foto de perfil"
                title="Cambiar foto de perfil"
                onClick={abrirModalFoto}
              >
                {fotoPerfil ? (
                  <img src={fotoPerfil} alt="" />
                ) : (
                  <span>{perfilActual.iniciales || <FaUser />}</span>
                )}
                <span className="profile-photo-add-badge" aria-hidden="true">+</span>
              </button>
              <div>
                <h2>Datos del perfil</h2>
                <p>Actualiza el nombre que aparece en tu espacio de trabajo.</p>
              </div>
            </div>
            <div className="profile-data-fields">
              <div>
                <label htmlFor="perfil-nombre">Nombre</label>
                <input
                  id="perfil-nombre"
                  name="nombre"
                  type="text"
                  autoComplete="given-name"
                  maxLength={100}
                  value={nombrePerfil}
                  onChange={(event) => {
                    setNombrePerfil(event.target.value);
                    setErrorPerfil("");
                  }}
                  disabled={guardandoPerfil}
                />
              </div>
              <div>
                <label htmlFor="perfil-apellido">Apellido</label>
                <input
                  id="perfil-apellido"
                  name="apellido"
                  type="text"
                  autoComplete="family-name"
                  maxLength={100}
                  value={apellidoPerfil}
                  onChange={(event) => {
                    setApellidoPerfil(event.target.value);
                    setErrorPerfil("");
                  }}
                  disabled={guardandoPerfil}
                />
              </div>
              <div className="profile-email-field">
                <label htmlFor="perfil-email">Correo electrónico</label>
                <input
                  id="perfil-email"
                  type="email"
                  value={perfilActual.correo}
                  readOnly
                  aria-readonly="true"
                />
              </div>
            </div>
            {errorPerfil && (
              <p className="inline-error profile-data-error" role="alert">
                {errorPerfil}
              </p>
            )}
            {errorFoto && !mostrarModalFoto && (
              <p className="inline-error profile-data-error" role="alert">
                {errorFoto}
              </p>
            )}
            <div className="profile-data-actions">
              <button
                className="btn primary"
                type="button"
                disabled={guardandoPerfil}
                onClick={guardarPerfil}
              >
                {guardandoPerfil ? "Guardando perfil..." : "Guardar perfil"}
              </button>
            </div>
          </section>

          {mostrarModalFoto && (
            <Modal
              title="Actualizar foto de perfil"
              subtitle="Esta imagen aparece en la navegación y en tus actividades."
              close={cerrarModalFoto}
            >
              <div className="profile-photo-modal-content">
                <div className="profile-photo-preview" aria-label={`Vista previa de la foto de perfil de ${perfilActual.nombre}`}>
                  {vistaPreviaFoto || fotoPerfil ? (
                    <img
                      src={vistaPreviaFoto || fotoPerfil}
                      alt={`Vista previa de la foto de perfil de ${perfilActual.nombre}`}
                    />
                  ) : (
                    <span>{perfilActual.iniciales}</span>
                  )}
                </div>
                <input
                  ref={inputFotoRef}
                  className="profile-photo-input"
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="Seleccionar foto de perfil"
                  disabled={subiendoFoto}
                  onChange={(event) => {
                    seleccionarFotoPerfil(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button
                  className="btn secondary profile-change-photo"
                  type="button"
                  disabled={subiendoFoto}
                  onClick={() => inputFotoRef.current?.click()}
                >
                  {fotoSeleccionada ? "Elegir otra foto" : "Seleccionar imagen"}
                </button>
                <small className="profile-photo-hint">JPG o PNG · Máximo 5 MB</small>
                <div
                  className={`profile-photo-dropzone${subiendoFoto ? " disabled" : ""}`}
                  role="button"
                  tabIndex={subiendoFoto ? -1 : 0}
                  aria-disabled={subiendoFoto}
                  onClick={() => {
                    if (!subiendoFoto) inputFotoRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (subiendoFoto) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      inputFotoRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    if (!subiendoFoto) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!subiendoFoto) seleccionarFotoPerfil(event.dataTransfer.files?.[0]);
                  }}
                >
                  <span className="profile-drop-icon" aria-hidden="true">⇧</span>
                  <span>
                    <strong>Arrastra y suelta una imagen aquí</strong>
                    <small>o selecciona una imagen desde tu dispositivo.</small>
                  </span>
                </div>
                {fotoSeleccionada && (
                  <p className="profile-photo-selected" title={fotoSeleccionada.name}>
                    {fotoSeleccionada.name}
                  </p>
                )}
                {errorFoto && <p className="inline-error profile-photo-error" role="alert">{errorFoto}</p>}
                {subiendoFoto && (
                  <p className="profile-photo-status" role="status">
                    Subiendo y guardando tu foto de perfil...
                  </p>
                )}
                <div className="profile-photo-modal-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={subiendoFoto}
                    onClick={cerrarModalFoto}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={!fotoSeleccionada || subiendoFoto}
                    onClick={guardarFotoPerfil}
                  >
                    {subiendoFoto ? "Guardando..." : "Guardar foto"}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          <section className="card configuration-card work-limit-card">
            <div className="settings-section-heading">
              <span className="settings-section-icon" aria-hidden="true">◷</span>
              <div>
                <h2>Límite diario de trabajo</h2>
                <p>Define cuántas horas puedes planificar al día.</p>
              </div>
            </div>

            <div className="work-limit-panel">
              <div className="work-limit-copy">
                <strong>Máximo de horas por día</strong>
                <span>Jornada óptima estimada para asignación de eventos.</span>
              </div>
              <div className="hours-stepper" aria-label="Máximo de horas por día">
                <button
                  type="button"
                  aria-label="Disminuir horas por día"
                  disabled={Number(horasDia) <= 1 || guardando}
                  onClick={() => ajustarHoras(-1)}
                >−</button>
                <input
                  id="horas-dia"
                  name="horas-dia"
                  type="number"
                  min="1"
                  max="16"
                  step="1"
                  value={horasDia}
                  onChange={cambiarHoras}
                  aria-label="Máximo de horas por día"
                  aria-invalid={Boolean(errorCampo)}
                  aria-describedby="horas-dia-ayuda horas-dia-error"
                />
                <span>horas</span>
                <button
                  type="button"
                  aria-label="Aumentar horas por día"
                  disabled={Number(horasDia) >= 16 || guardando}
                  onClick={() => ajustarHoras(1)}
                >+</button>
              </div>

              <small id="horas-dia-ayuda" className="work-limit-help">
                <span aria-hidden="true">ⓘ</span> Este límite se usa para detectar sobrecargas en tu planificación.
              </small>
              {errorCampo && (
                <p id="horas-dia-error" className="inline-error" role="alert">{errorCampo}</p>
              )}
            </div>
          </section>

          <div className="configuration-actions profile-settings-actions">
            <button className="btn secondary" type="button" disabled={guardando} onClick={cancelarCambios}>
              Cancelar
            </button>
            <button className="btn primary" type="button" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando..." : "▣  Guardar cambios"}
            </button>
          </div>
        </div>
      )}

      {conflictoConfiguracion && (
        <ModalReprogramarLimite
          conflicto={conflictoConfiguracion}
          guardando={guardando}
          onCancelar={() => setConflictoConfiguracion(null)}
          onGuardar={async (reprogramaciones) => {
            setGuardando(true);
            try {
              // Reprogramar primero las subtareas elegidas. Si falla una, no se guarda el nuevo límite.
              for (const tarea of reprogramaciones) {
                if (
                  tarea.fecha === tarea.fechaOriginal &&
                  Math.abs(Number(tarea.horas_estimadas) - Number(tarea.horasOriginales)) < 1e-9
                ) continue;
                if (!tarea.evento_id) {
                  throw new Error(`No se pudo identificar el evento de "${tarea.titulo}". Comprueba la subtarea e inténtalo de nuevo.`);
                }
                await actualizarSubtarea(tarea.id, {
                  evento_id: tarea.evento_id,
                  titulo: tarea.titulo,
                  dia_objetivo: tarea.fecha,
                  horas_estimadas: Number(tarea.horas_estimadas),
                  estado: tarea.estado || "pendiente",
                  notas: tarea.notas || null,
                });
              }
              const data = await actualizarConfiguracionUsuario(conflictoConfiguracion.limite_horas);
              setHorasDia(Number(data.horas_dia));
              setHorasGuardadas(Number(data.horas_dia));
              setConflictoConfiguracion(null);
              onNotify("Subtareas reprogramadas y límite diario actualizado correctamente.");
            } catch (errorActual) {
              onNotify(errorActual.message || "No fue posible reprogramar las subtareas o guardar el límite.", "error");
            } finally {
              setGuardando(false);
            }
          }}
        />
      )}
    </section>
  );
}

function obtenerFechaLocalHoy() {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, "0");
  const day = String(hoy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ModalReprogramarLimite({ conflicto, guardando, onCancelar, onGuardar }) {
  const agendaInicial = Array.isArray(conflicto?.agenda) ? conflicto.agenda : [];
  const [fechas, setFechas] = useState(() => Object.fromEntries(
    agendaInicial.map((tarea) => [String(tarea.id), String(tarea.dia_objetivo || conflicto.fecha_objetivo || "").slice(0, 10)])
  ));
  const [horasPorTarea, setHorasPorTarea] = useState(() => Object.fromEntries(
    agendaInicial.map((tarea) => [String(tarea.id), Number(tarea.horas_estimadas) || 0])
  ));
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const [errorLocal, setErrorLocal] = useState("");

  const tareas = agendaInicial.map((tarea) => ({
    ...tarea,
    fechaOriginal: String(tarea.dia_objetivo || conflicto.fecha_objetivo || "").slice(0, 10),
    fecha: fechas[String(tarea.id)] || String(tarea.dia_objetivo || conflicto.fecha_objetivo || "").slice(0, 10),
    horasOriginales: Number(tarea.horas_estimadas) || 0,
    horas_estimadas: Number(horasPorTarea[String(tarea.id)] ?? tarea.horas_estimadas) || 0,
  }));

  const cargaPorFecha = (Array.isArray(conflicto?.cargaExistente) ? conflicto.cargaExistente : [])
    .reduce((acumulado, tarea) => {
      const fecha = String(tarea.fecha || "").slice(0, 10);
      if (fecha) acumulado[fecha] = (acumulado[fecha] || 0) + (Number(tarea.horas_estimadas) || 0);
      return acumulado;
    }, {});
  tareas.forEach((tarea) => {
    cargaPorFecha[tarea.fecha] = (cargaPorFecha[tarea.fecha] || 0) + tarea.horas_estimadas;
  });

  const limite = Number(conflicto?.limite_horas) || 0;
  const fechasConExceso = Object.entries(cargaPorFecha)
    .filter(([, horas]) => horas > limite + 1e-9)
    .map(([fecha, horas]) => ({ fecha, horas, exceso: horas - limite }));
  const hayExceso = fechasConExceso.length > 0;
  const cambios = tareas.some((tarea) =>
    tarea.fecha !== tarea.fechaOriginal ||
    Math.abs(tarea.horas_estimadas - tarea.horasOriginales) > 1e-9
  );
  const maximoDiario = Object.values(cargaPorFecha).reduce((max, horas) => Math.max(max, horas), 0);

  const prepararConflictoTarea = (tarea) => {
    const cargaMismoDia = tareas
      .filter((otra) => otra.fecha === tarea.fecha && String(otra.id) !== String(tarea.id))
      .reduce((total, otra) => total + otra.horas_estimadas, 0) +
      (Array.isArray(conflicto?.cargaExistente) ? conflicto.cargaExistente : [])
        .filter((otra) => String(otra.fecha || "").slice(0, 10) === tarea.fecha)
        .reduce((total, otra) => total + (Number(otra.horas_estimadas) || 0), 0);

    // Busca un día posterior con espacio suficiente para que el modal existente
    // pueda ofrecer la opción de mover la subtarea completa.
    let fechaRecomendada = null;
    let horasRecomendadas = 0;
    const base = new Date(`${tarea.fecha}T12:00:00`);
    for (let dias = 1; dias <= 365; dias += 1) {
      const candidata = new Date(base);
      candidata.setDate(candidata.getDate() + dias);
      const fecha = `${candidata.getFullYear()}-${String(candidata.getMonth() + 1).padStart(2, "0")}-${String(candidata.getDate()).padStart(2, "0")}`;
      const cargaDestino = tareas
        .filter((otra) => otra.fecha === fecha && String(otra.id) !== String(tarea.id))
        .reduce((total, otra) => total + otra.horas_estimadas, 0) +
        (Array.isArray(conflicto?.cargaExistente) ? conflicto.cargaExistente : [])
          .filter((otra) => String(otra.fecha || "").slice(0, 10) === fecha)
          .reduce((total, otra) => total + (Number(otra.horas_estimadas) || 0), 0);
      if (cargaDestino + tarea.horas_estimadas <= limite + 1e-9) {
        fechaRecomendada = fecha;
        horasRecomendadas = cargaDestino;
        break;
      }
    }

    return {
      ...conflicto,
      fecha_objetivo: tarea.fecha,
      fecha_recomendada: fechaRecomendada,
      horas_recomendadas: horasRecomendadas,
      limite_horas: limite,
      horas_asignadas: cargaMismoDia + tarea.horas_estimadas,
      horas_causa: tarea.horas_estimadas,
      horas_otras: cargaMismoDia,
      agenda: tareas
        .filter((otra) => otra.fecha === tarea.fecha && String(otra.id) !== String(tarea.id))
        .map((otra) => ({
          id: otra.id,
          titulo: otra.titulo,
          evento: otra.evento,
          horas_estimadas: otra.horas_estimadas,
        })),
      id_subtarea_causa: tarea.id,
    };
  };

  const guardar = async () => {
    setErrorLocal("");
    if (hayExceso) {
      setErrorLocal("Todavía hay días que superan el límite. Pulsa «Reprogramar» en las subtareas que causan la sobrecarga.");
      return;
    }
    if (!cambios) {
      setErrorLocal("Reprograma al menos una subtarea o ajusta sus horas para resolver la sobrecarga.");
      return;
    }
    await onGuardar(tareas);
  };

  if (!conflicto) return null;

  return (
    <>
      {!tareaSeleccionada && (
        <div className="postpone-overlay">
          <div className="agenda-modal agenda-reschedule-limit-modal" role="dialog" aria-modal="true" aria-labelledby="limit-reschedule-title">
            <button type="button" className="postpone-close" aria-label="Cerrar" disabled={guardando} onClick={onCancelar}>×</button>
            <div className="agenda-modal-title">
              <span className="agenda-warning-icon">⚠</span>
              <div>
                <h2 id="limit-reschedule-title">Sobrecarga al reducir el límite</h2>
                <p>Al reducir el límite a {formatearDuracion(limite)}, las subtareas del {formatearFecha(conflicto.fecha_objetivo)} superan la nueva capacidad. Pulsa «Reprogramar» en cada tarea que quieras mover de día o ajustar de duración.</p>
              </div>
            </div>
            <div className="agenda-capacity-card">
              <div>
                <strong>{formatearDuracion(maximoDiario)} <small>máximo por día tras los cambios</small></strong>
                <span>{formatearDuracion(limite)} de tope · {hayExceso ? `+${formatearDuracion(fechasConExceso.reduce((sum, item) => sum + item.exceso, 0))} de exceso` : "sin sobrecarga"}</span>
              </div>
              <div className="agenda-capacity-track"><span style={{ width: `${Math.min((maximoDiario / Math.max(limite, 1)) * 100, 100)}%`, background: hayExceso ? "#c7353d" : "#07835b" }} /></div>
            </div>
            <small className="agenda-breakdown-label">SUBTAREAS QUE PUEDES REPROGRAMAR</small>
            <div className="agenda-reschedule-limit-list">
              {tareas.map((tarea) => {
                const excesoEnFecha = (cargaPorFecha[tarea.fecha] || 0) > limite + 1e-9;
                const cambioAplicado = tarea.fecha !== tarea.fechaOriginal || Math.abs(tarea.horas_estimadas - tarea.horasOriginales) > 1e-9;
                return (
                  <div className="agenda-reschedule-limit-item agenda-reschedule-limit-item-action" key={tarea.id}>
                    <div className="agenda-reschedule-limit-info">
                      <strong>{tarea.titulo}</strong>
                      <small>{tarea.evento || "Evento sin título"} · {formatearDuracion(tarea.horas_estimadas)}</small>
                      <small>{cambioAplicado ? `Nueva fecha: ${formatearFecha(tarea.fecha)} · Original: ${formatearFecha(tarea.fechaOriginal)}` : `Fecha actual: ${formatearFecha(tarea.fechaOriginal)}`}</small>
                      {excesoEnFecha && <small className="agenda-reschedule-date-error">Este día todavía supera las {formatearDuracion(limite)} disponibles.</small>}
                    </div>
                    <button type="button" className="btn secondary agenda-reschedule-one-button" disabled={guardando} onClick={() => setTareaSeleccionada(tarea)}>Reprogramar</button>
                  </div>
                );
              })}
            </div>
            {errorLocal && <p className="inline-error" role="alert">{errorLocal}</p>}
            <div className="agenda-modal-actions">
              <button type="button" className="btn secondary" disabled={guardando} onClick={onCancelar}>Cancelar</button>
              <button type="button" className="btn primary" disabled={guardando || hayExceso || !cambios} onClick={guardar}>{guardando ? "Guardando..." : "Reprogramar y guardar"}</button>
            </div>
          </div>
        </div>
      )}
      {tareaSeleccionada && (
        <ModalResolucionSobrecarga
          conflicto={prepararConflictoTarea(tareaSeleccionada)}
          horasCausa={tareaSeleccionada.horas_estimadas}
          tituloCausa={tareaSeleccionada.titulo}
          titulo={`Reprogramar: ${tareaSeleccionada.titulo}`}
          descripcion={`Elige si deseas mover esta subtarea a otro día o reducir su duración para ajustarte al límite diario de ${formatearDuracion(limite)}.`}
          etiquetaAccion="Resolver conflicto →"
          guardando={guardando}
          permitirResolucion={true}
          mostrarCancelar={true}
          onCancelar={() => setTareaSeleccionada(null)}
          onAccion={(solucion) => {
            setFechas((actuales) => ({
              ...actuales,
              [String(tareaSeleccionada.id)]: solucion.tipo === "mover"
                ? solucion.fecha
                : tareaSeleccionada.fecha,
            }));
            setHorasPorTarea((actuales) => ({
              ...actuales,
              [String(tareaSeleccionada.id)]: Number(solucion.horas),
            }));
            setTareaSeleccionada(null);
          }}
        />
      )}
    </>
  );
}

function ModalResolucionSobrecarga({
  conflicto,
  horasCausa,
  tituloCausa,
  titulo,
  descripcion,
  etiquetaAccion,
  etiquetaDesglose = "DESGLOSE DEL DÍA",
  elementos,
  mostrarCapacidad = true,
  permitirResolucion = true,
  mostrarAcciones = true,
  mostrarCancelar = false,
  onAccion,
  onCancelar,
  guardando,
}) {
  const [resolucion, setResolucion] = useState(false);
  // "Sin fecha" no es un destino válido para resolver una sobrecarga:
  // solo se puede mover si existe una fecha real recomendada.
  const fechaRecomendadaValida = (() => {
    const fecha = conflicto?.fecha_recomendada;
    if (!fecha || typeof fecha !== "string") return false;
    const normalizada = fecha.trim().toLowerCase();
    if (["sin fecha", "sin_fecha", "sin-fecha", "null", "undefined"].includes(normalizada)) {
      return false;
    }
    return (
     /^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      /^\d{2}\/\d{2}\/\d{4}$/.test(fecha)
  );
  })();
  const [estrategia, setEstrategia] = useState(
    fechaRecomendadaValida ? "mover" : "manual"
  );
  const [horasManuales, setHorasManuales] = useState(() =>
    calcularHorasManualesIniciales(conflicto, horasCausa)
  );

  const lista = elementos ?? conflicto?.agenda ?? [];
  // El conflicto es la fuente de la duración de la causa; la prop solo sirve
  // para los avisos que no pasan por construirConflictoSobrecarga.
  const horasCausaConflicto =
    Number(conflicto?.horas_causa) || Number(horasCausa) || 0;
  // Estado real del día en conflicto, tal como está antes de resolverlo.
  const estadoActual = {
    asignadas: Number(conflicto?.horas_asignadas) || 0,
    limite: Number(conflicto?.limite_horas) || 0,
    exceso: Math.max(
      0,
      (Number(conflicto?.horas_asignadas) || 0) -
        (Number(conflicto?.limite_horas) || 0)
    ),
  };
  const resolucionActual = calcularResolucionSobrecarga({
    conflicto,
    estrategia,
    horasManuales,
    horasCausa: horasCausaConflicto,
  });

  const comenzarResolucion = () => {
    setEstrategia(fechaRecomendadaValida ? "mover" : "manual");
    setHorasManuales(
      calcularHorasManualesIniciales(conflicto, horasCausaConflicto)
    );
    setResolucion(true);
  };

  const aplicarSolucion = () => {
    if (!resolucionActual.valido) return;
    if (estrategia === "mover" && !fechaRecomendadaValida) return;

    onAccion?.({
      tipo: resolucionActual.estrategia,
      fecha: resolucionActual.fecha_destino || conflicto.fecha_objetivo,
      horas: resolucionActual.horas_aplicadas,
    });
  };

  if (!conflicto) {
    return null;
  }

  return (
    <>
      {!resolucion && (
        <div className="postpone-overlay">
          <div
            className="agenda-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="limit-title"
          >
            <button
              type="button"
              className="postpone-close"
              aria-label="Cerrar"
              disabled={guardando}
              onClick={onCancelar}
            >
              ×
            </button>
            <div className="agenda-modal-title">
              <span className="agenda-warning-icon">⚠</span>
              <div>
                <h2 id="limit-title">
                  {titulo || "Límite de jornada excedido"}
                </h2>
                <p>
                  {descripcion ??
                    `El ${formatearFecha(conflicto.fecha_objetivo)} superarías tu jornada máxima configurada (${formatearDuracion(conflicto.limite_horas)}).`}
                </p>
              </div>
            </div>
            {mostrarCapacidad && (
              <div className="agenda-capacity-card">
                <div>
                  <strong>
                    {formatearDuracion(estadoActual.asignadas)}{" "}
                    <small>asignadas</small>
                  </strong>
                  <span>
                    {formatearDuracion(estadoActual.limite)} de tope
                    {" "}· +{formatearDuracion(estadoActual.exceso)}
                    {" "}de exceso
                  </span>
                </div>
                <div className="agenda-capacity-track">
                  <span
                    style={{
                      width: `${
                        estadoActual.asignadas > 0
                          ? Math.min(
                              (estadoActual.limite / estadoActual.asignadas) *
                                100,
                              100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
            {lista.length > 0 && (
              <>
                <small className="agenda-breakdown-label">
                  {etiquetaDesglose}
                </small>
                <div className="agenda-breakdown">
                  {lista.map((gestion) => (
                    <div className="agenda-breakdown-item" key={gestion.id}>
                      <span>
                        <strong>
                          {gestion.titulo}
                          {gestion.es_subtarea_reprogramada && (
                            <em> · Causa del exceso</em>
                          )}
                        </strong>
                        <small>{gestion.evento}</small>
                      </span>
                      <b>{formatearDuracion(gestion.horas_estimadas)}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            {(mostrarAcciones || mostrarCancelar) && (
              <div className="agenda-modal-actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={guardando}
                  onClick={onCancelar}
                >
                  Cancelar
                </button>
                {mostrarAcciones && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={permitirResolucion ? comenzarResolucion : onAccion}
                    disabled={guardando}
                  >
                    {etiquetaAccion || (permitirResolucion ? "Resolver conflicto →" : "Continuar")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {resolucion && permitirResolucion && (
        <div className="postpone-overlay">
          <div
            className="agenda-modal resolution-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolution-title"
          >
            <button
              type="button"
              className="postpone-close"
              aria-label="Cerrar"
              disabled={guardando}
              onClick={() => setResolucion(false)}
            >
              ×
            </button>
            <h2 id="resolution-title">Resolver sobrecarga de horas</h2>
            <p>
              {formatearFecha(conflicto.fecha_objetivo)} · Exceso de{" "}
              {formatearDuracion(estadoActual.exceso)}. Selecciona
              cómo deseas equilibrar tu agenda.
            </p>
            <div className="agenda-capacity-card compact">
              <div>
                <strong>
                  {formatearDuracion(resolucionActual.asignadas)}
                  {" "}asignadas
                </strong>
                <span>
                  {formatearDuracion(resolucionActual.limite)} de tope
                  {" "}· +{formatearDuracion(resolucionActual.exceso)}
                  {" "}de exceso
                </span>
              </div>
              <div className="agenda-capacity-track">
                <span
                  style={{
                    width: `${
                      resolucionActual.asignadas > 0
                        ? Math.min(
                            (resolucionActual.limite /
                              resolucionActual.asignadas) *
                              100,
                            100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="resolution-cause">
              ⚠ {tituloCausa} · Causa del exceso
              {" "}({formatearDuracion(horasCausaConflicto)})
            </div>
            <div className="resolution-options">
              <button
                type="button"
                className={`resolution-option ${estrategia === "mover" ? "selected" : ""} ${!fechaRecomendadaValida ? "disabled" : ""}`}
                aria-pressed={estrategia === "mover"}
                aria-disabled={!fechaRecomendadaValida}
                disabled={!fechaRecomendadaValida}
                onClick={() => {
                  if (fechaRecomendadaValida) setEstrategia("mover");
                }}
              >
                <span className="resolution-radio" />
                <span>
                  <strong>
                    {fechaRecomendadaValida
                      ? `Mover a ${formatearFecha(conflicto.fecha_recomendada)}`
                      : "Agenda llena"}
                    {fechaRecomendadaValida && <em>Recomendada</em>}
                  </strong>
                  <small>
                    {fechaRecomendadaValida
                      ? "Reubica la gestión completa al día con menor carga que permita mantener su duración."
                      : "No hay otro día con capacidad suficiente. Reduce las horas de la subtarea para resolver el conflicto."}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className={`resolution-option ${estrategia === "manual" ? "selected" : ""}`}
                aria-pressed={estrategia === "manual"}
                onClick={() => setEstrategia("manual")}
              >
                <span className="resolution-radio" />
                <span>
                  <strong>Ajustar manualmente</strong>
                  <small>
                    Aumenta o disminuye la duración y verifica que no supere la
                    disponibilidad de la jornada.
                  </small>
                </span>
              </button>
            </div>
            {estrategia === "manual" && (
              <div className="postpone-field resolution-hours-field">
                <label>Duración manual</label>
                <div className="resolution-duration-editor">
                  <DurationInput
                    id="resolution-duration"
                    name="resolution-duration"
                    value={String(horasManuales)}
                    onChange={(event) => {
                      const valor = event.target.value;
                      setHorasManuales(valor === "" ? 0 : Number(valor));
                    }}
                    disabled={guardando}
                    maxHours={24}
                  />
                  <div className="resolution-duration-stepper" aria-label="Ajuste rápido de duración">
                    <button
                      type="button"
                      aria-label="Disminuir media hora"
                      onClick={() =>
                        setHorasManuales((horas) =>
                          redondearHoras(
                            Math.max(1 / 60, Number(horas) - PASO_HORAS_MANUALES)
                          )
                        )
                      }
                      disabled={guardando || horasManuales <= (1 / 60)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label="Aumentar media hora"
                      onClick={() =>
                        setHorasManuales((horas) =>
                          redondearHoras(Number(horas) + PASO_HORAS_MANUALES)
                        )
                      }
                      disabled={guardando || horasManuales >= 24}
                    >
                      +
                    </button>
                  </div>
                </div>
                {resolucionActual.alerta && (
                  <small className="resolution-hours-alert" role="alert">
                    {resolverMensajeAlerta(resolucionActual)}
                  </small>
                )}
              </div>
            )}
            {estrategia === "mover" && resolucionActual.alerta && (
              <small className="resolution-hours-alert" role="alert">
                {resolverMensajeAlerta(resolucionActual)}
              </small>
            )}
            <div className="agenda-modal-actions resolution-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={guardando}
                onClick={() => setResolucion(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={aplicarSolucion}
                disabled={guardando || !resolucionActual.valido}
              >
                {guardando ? "Reprogramando…" : "Aplicar solución"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Today({ onNotify, recargaToken = 0 }) {
  const [tareas, setTareas] = useState([]);
  const [gestionesVencidas, setGestionesVencidas] = useState([]);
  const [proximasGestiones, setProximasGestiones] = useState([]);
  const [subtareasAgenda, setSubtareasAgenda] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizando, setActualizando] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);
  const [archivoEvidencia, setArchivoEvidencia] = useState(null);
  const [vistaPreviaEvidencia, setVistaPreviaEvidencia] = useState("");
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [errorEvidencia, setErrorEvidencia] = useState("");
  const inputEvidenciaRef = useRef(null);
  const [capacidadDiaria, setCapacidadDiaria] = useState(6);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [filtroEvento, setFiltroEvento] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [tareaPosponer, setTareaPosponer] = useState(null);
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [notaPosposicion, setNotaPosposicion] = useState("");
  const [horasPosposicion, setHorasPosposicion] = useState(0);
  const [conflictoJornada, setConflictoJornada] = useState(null);
  // Estado que se guardará al resolver la sobrecarga: pospuesto al reprogramar,
  // pendiente si el usuario está desmarcando una subtarea hecha.
  const [estadoResolucionJornada, setEstadoResolucionJornada] = useState("pospuesto");
  const [mesCalendario, setMesCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [guardandoPosposicion, setGuardandoPosposicion] = useState(false);
  const notaPosponerRef = useRef(null);
  const ajustarNotaPosponer = () => {
    const elemento = notaPosponerRef.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  };
  const claveCompletadasHoy = `eventhub_completadas_hoy_${obtenerFechaLocalHoy()}`;
  const completadasHoyRef = useRef((() => {
    try {
      return new Set(
        JSON.parse(sessionStorage.getItem(claveCompletadasHoy) || "[]")
          .map(String)
      );
    } catch {
      return new Set();
    }
  })());

  useEffect(() => {
    if (!archivoEvidencia) {
      setVistaPreviaEvidencia("");
      return undefined;
    }

    const url = URL.createObjectURL(archivoEvidencia);
    setVistaPreviaEvidencia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivoEvidencia]);

  useEffect(() => {
    setArchivoEvidencia(null);
    setErrorEvidencia("");
  }, [seleccionada?.id]);


  const cargarHoy = async () => {
    setCargando(true);
    setError("");

    try {
      const [eventosData, subtareasData, hoyData] = await Promise.all([
        obtenerEventos(),
        obtenerSubtareas(),
        obtenerHoy(),
      ]);

      const listaEventos = Array.isArray(eventosData)
        ? eventosData
        : [];

      const listaSubtareas = Array.isArray(subtareasData)
        ? subtareasData
        : [];

      const horasConfiguradas = Number(
        hoyData?.resumen?.limite_horas_dia
      );

      if (
        Number.isInteger(horasConfiguradas) &&
        horasConfiguradas > 0
      ) {
        setCapacidadDiaria(horasConfiguradas);
      } else {
        setCapacidadDiaria(6);
      }
      const eventosPorId = new Map(
        listaEventos.map((evento) => [String(evento.id), evento])
      );

      const hoy = hoyData?.fecha || obtenerFechaLocalHoy();

      const subtareasPreparadas = listaSubtareas.map((subtarea) => {
        const evento = eventosPorId.get(String(subtarea.evento_id));

        return {
          ...subtarea,
          evento,
          fechaObjetivo: subtarea.dia_objetivo || evento?.fecha || null,
        };
      });

      const resolverSubtarea = (subtarea) => ({
        ...subtareasPreparadas.find(
          (item) => String(item.id) === String(subtarea.id)
        ),
        ...subtarea,
        evento: eventosPorId.get(String(subtarea.evento_id)),
        fechaObjetivo: subtarea.dia_objetivo || null,
      });
      const gestionesActivas = [
        ...(hoyData?.vencidas || []),
        ...(hoyData?.urgentes || []),
        ...(hoyData?.proximas || []),
      ].map(resolverSubtarea);
      const gestionesVencidasBackend = (hoyData?.vencidas || [])
        .map(resolverSubtarea)
        // Se confirma con la regla compartida usando la fecha de referencia que
        // aplicó el backend.
        .filter((subtarea) => estaVencida(subtarea, hoy))
        .sort((a, b) =>
          String(a.fechaObjetivo || "").localeCompare(
            String(b.fechaObjetivo || "")
          )
        );
      const proximasBackend = (hoyData?.proximas || [])
        .map(resolverSubtarea)
        .sort((a, b) =>
          String(a.fechaObjetivo || "").localeCompare(
            String(b.fechaObjetivo || "")
          )
        )
        .slice(0, 8);
      const completadasDeHoy = subtareasPreparadas.filter(
        (subtarea) =>
          normalizarEstado(subtarea.estado) === "hecho" &&
          (
            String(subtarea.fechaObjetivo || "").slice(0, 10) === hoy ||
            completadasHoyRef.current.has(String(subtarea.id))
          )
      );

      const tareasDeHoy = [
        ...gestionesActivas.filter(
          (subtarea) =>
            String(subtarea.fechaObjetivo || "").slice(0, 10) === hoy
        ),
        ...completadasDeHoy,
      ]
        .sort((a, b) => {
          const estadoA = normalizarEstado(a.estado);
          const estadoB = normalizarEstado(b.estado);

          if (estadoA === "hecho" && estadoB !== "hecho") return 1;
          if (estadoA !== "hecho" && estadoB === "hecho") return -1;

          const horasA = obtenerHoras(a);
          const horasB = obtenerHoras(b);

          if (horasA !== horasB) return horasA - horasB;

          return obtenerTituloSubtarea(a).localeCompare(
            obtenerTituloSubtarea(b),
            "es"
          );
        });

      setTareas(tareasDeHoy);
      setGestionesVencidas(gestionesVencidasBackend);
      setProximasGestiones(proximasBackend);
      setSubtareasAgenda(
        subtareasPreparadas.filter(
          (subtarea) =>
            !["hecho", "completada", "completado", "hecha"].includes(
              String(subtarea.estado || "").toLowerCase()
            )
        )
      );

      if (
        seleccionada &&
        !tareasDeHoy.some((tarea) => tarea.id === seleccionada.id)
      ) {
        setSeleccionada(null);
      }
    } catch (errorActual) {
      setError(
        errorActual.message || "No fue posible cargar las tareas de hoy."
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarHoy();
  }, [recargaToken]);

  const seleccionarEvidencia = (archivo) => {
    setErrorEvidencia("");
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      setErrorEvidencia("Selecciona un archivo de imagen.");
      return;
    }
    if (archivo.size === 0) {
      setErrorEvidencia("El archivo está vacío.");
      return;
    }
    if (archivo.size > 10 * 1024 * 1024) {
      setErrorEvidencia("La imagen debe pesar 10 MB o menos.");
      return;
    }
    setArchivoEvidencia(archivo);
  };

  const guardarEvidencia = async () => {
    if (!seleccionada || !archivoEvidencia || subiendoEvidencia) return;

    setSubiendoEvidencia(true);
    setErrorEvidencia("");
    try {
      const resultado = await subirComprobanteSubtarea(
        seleccionada.id,
        archivoEvidencia
      );
      const url = resultado?.comprobante_url;
      if (!url) {
        throw new Error("El servidor no devolvió la URL de la evidencia guardada.");
      }

      const actualizarEnLista = (lista) =>
        lista.map((item) =>
          String(item.id) === String(seleccionada.id)
            ? { ...item, comprobante_url: url }
            : item
        );
      setSeleccionada((actual) =>
        actual && String(actual.id) === String(seleccionada.id)
          ? { ...actual, comprobante_url: url }
          : actual
      );
      setTareas(actualizarEnLista);
      setGestionesVencidas(actualizarEnLista);
      setProximasGestiones(actualizarEnLista);
      setArchivoEvidencia(null);
      onNotify("Evidencia guardada correctamente.");
    } catch (errorActual) {
      setErrorEvidencia(
        errorActual.message || "No fue posible guardar la evidencia."
      );
    } finally {
      setSubiendoEvidencia(false);
    }
  };

  // El campo arranca con tres líneas, pero se ajusta al contenido cuando el
  // modal se abre con una nota larga ya guardada.
  useEffect(() => {
    if (!tareaPosponer) return;

    ajustarNotaPosponer();
  }, [tareaPosponer]);

  const abrirModalPosponer = (tarea) => {
    setTareaPosponer(tarea);
    setNuevaFecha("");
    // Precarga la nota ya guardada para no perderla al reprogramar.
    setNotaPosposicion(obtenerNotaSubtarea(tarea));
    setConflictoJornada(null);
    setEstadoResolucionJornada("pospuesto");
    setHorasPosposicion(obtenerHoras(tarea));
    setMesCalendario(() => {
      const hoy = new Date();
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
  };
  const fechaLimitePosponer = obtenerFechaLimiteSubtarea(
    tareaPosponer?.evento?.fecha
  );
  const reprogramarConValidacionLocal = async (tarea, fecha, horas) => {
    const conflicto = construirConflictoSobrecarga({
      agenda: subtareasAgenda,
      fecha,
      horas,
      capacidadDiaria,
      excluirId: tarea.id,
      fechaLimite: fechaLimitePosponer,
      titulo: obtenerTituloSubtarea(tarea),
      eventoTitulo: tarea.evento?.titulo,
    });

    if (conflicto) {
      return { actualizada: false, ...conflicto };
    }

    // La nota es opcional: vacía se envía como `null`.
    const nota = notaPosposicion.trim();

    const datosActualizacion = {
      estado: estadoResolucionJornada,
      dia_objetivo: fecha,
      horas_estimadas: Number(horas),
    };
    // Solo se modifica la nota en el flujo de posposición; al resolver una
    // sobrecarga al volver a pendiente se conserva la nota existente.
    if (estadoResolucionJornada === "pospuesto") {
      datosActualizacion.notas = nota || null;
    }
    const subtareaActualizada = await actualizarParcialSubtarea(tarea.id, datosActualizacion);

    return {
      actualizada: true,
      subtarea: subtareaActualizada,
    };
  };
  const confirmarPosposicion = async () => {
    setEstadoResolucionJornada("pospuesto");
    if (!tareaPosponer || !nuevaFecha) {
      return;
    }

    if (!esFechaSubtareaValida(nuevaFecha, tareaPosponer.evento?.fecha)) {
      onNotify(
        "Selecciona una fecha límite entre hoy y la fecha del evento.",
        "error"
      );
      return;
    }

    setGuardandoPosposicion(true);

    try {
      const resultado = await reprogramarConValidacionLocal(
        tareaPosponer,
        nuevaFecha,
        horasPosposicion
      );

      if (resultado?.limite_excedido) {
        setConflictoJornada(resultado);
        return;
      }

      if (!resultado?.actualizada) {
        throw new Error("No fue posible actualizar la subtarea.");
      }

      setTareaPosponer(null);
      setNuevaFecha("");
      setNotaPosposicion("");
      setConflictoJornada(null);

      await cargarHoy();

      onNotify("La fecha de la subtarea se actualizó correctamente.");
    } catch (errorActual) {
      onNotify(
        errorActual.message || "No fue posible actualizar la subtarea.",
        "error"
      );
    } finally {
      setGuardandoPosposicion(false);
    }
  };
  const aplicarResolucionSobrecarga = async ({ fecha, horas }) => {
    if (!tareaPosponer || !conflictoJornada) {
      return;
    }

    if (!fecha || !Number.isFinite(horas) || horas <= 0) {
      return;
    }
    if (!esFechaSubtareaValida(fecha, tareaPosponer.evento?.fecha)) {
      onNotify(
        "Selecciona una fecha límite entre hoy y la fecha del evento.",
        "error"
      );
      return;
    }
    setGuardandoPosposicion(true);

    try {
      const resultado = await reprogramarConValidacionLocal(
        tareaPosponer,
        fecha,
        horas
      );

      if (resultado?.limite_excedido) {
        setConflictoJornada(resultado);
        return;
      }

      if (!resultado?.actualizada) {
        throw new Error("No fue posible actualizar la subtarea.");
      }

      setConflictoJornada(null);
      setTareaPosponer(null);
      setNuevaFecha("");
      setNotaPosposicion("");
      await cargarHoy();
      onNotify("La fecha de la subtarea se actualizó correctamente.");
    } catch (errorActual) {
      onNotify(
        errorActual.message || "No fue posible actualizar la subtarea.",
        "error"
      );
    } finally {
      setGuardandoPosposicion(false);
    }
  };
  const cambiarEstado = async (tarea, nuevoEstado = null) => {
    const estadoActual = normalizarEstado(tarea.estado);

    const estadoNuevo =
      nuevoEstado ||
      (estadoActual === "hecho" ? "pendiente" : "hecho");

    // Al desmarcar una subtarea hecha, volverá a consumir horas de la jornada.
    // Si eso supera el límite, abre el modal de resolución existente en lugar
    // de dejar que el backend responda únicamente con una alerta roja.
    if (estadoActual === "hecho" && estadoNuevo === "pendiente") {
      const fechaTarea = String(
        tarea.fechaObjetivo || tarea.dia_objetivo || tarea.evento?.fecha || ""
      ).slice(0, 10);
      if (fechaTarea) {
        const conflictoCapacidad = construirConflictoSobrecarga({
          agenda: subtareasAgenda,
          fecha: fechaTarea,
          horas: obtenerHoras(tarea),
          capacidadDiaria,
          excluirId: tarea.id,
          fechaLimite: obtenerFechaLimiteSubtarea(tarea.evento?.fecha),
          titulo: obtenerTituloSubtarea(tarea),
          eventoTitulo: tarea.evento?.titulo,
          idSubtareaCausa: tarea.id,
        });
        if (conflictoCapacidad) {
          setTareaPosponer(tarea);
          setHorasPosposicion(obtenerHoras(tarea));
          setNuevaFecha(fechaTarea);
          setNotaPosposicion(obtenerNotaSubtarea(tarea));
          setEstadoResolucionJornada("pendiente");
          setConflictoJornada(conflictoCapacidad);
          return;
        }
      }
    }

    setActualizando(tarea.id);

    try {
      await actualizarParcialSubtarea(tarea.id, {
        estado: estadoNuevo,
      });

      if (estadoNuevo === "hecho") {
        completadasHoyRef.current.add(String(tarea.id));
      } else {
        completadasHoyRef.current.delete(String(tarea.id));
      }
      let errorPersistencia = false;
      try {
        sessionStorage.setItem(
          claveCompletadasHoy,
          JSON.stringify([...completadasHoyRef.current])
        );
      } catch (errorAlPersistir) {
        console.error("No fue posible conservar las gestiones realizadas hoy.", errorAlPersistir);
        errorPersistencia = true;
      }

      await cargarHoy();

      setSeleccionada((actual) =>
        actual?.id === tarea.id
          ? { ...actual, estado: estadoNuevo }
          : actual
      );

      onNotify(
        errorPersistencia
          ? "La ejecución se guardó, pero no fue posible conservarla en esta vista."
          : estadoNuevo === "hecho"
            ? "Subtarea marcada como hecha."
            : estadoNuevo === "pospuesto"
              ? "Subtarea pospuesta correctamente."
              : "Subtarea marcada como pendiente.",
        errorPersistencia ? "error" : "success"
      );
    } catch (errorActual) {
      onNotify(
        errorActual.message || "No fue posible actualizar la subtarea.",
        "error"
      );
    } finally {
      setActualizando(null);
    }
  };
  const eventosFiltro = Array.from(
    new Map(
      [...tareas, ...gestionesVencidas, ...proximasGestiones]
        .filter((tarea) => tarea.evento?.id)
        .map((tarea) => [
          String(tarea.evento.id),
          tarea.evento,
        ])
    ).values()
  );
  const aplicarFiltros = (lista) => {
    const busqueda = filtroBusqueda.trim().toLowerCase();

    return lista.filter((tarea) => {
      const estado = normalizarEstado(tarea.estado);
      const eventoId = String(tarea.evento?.id || "");

      const coincideEvento =
        !filtroEvento || eventoId === String(filtroEvento);

      const coincideEstado =
        !filtroEstado || estado === filtroEstado;

      const coincideBusqueda =
        !busqueda ||
        obtenerTituloSubtarea(tarea).toLowerCase().includes(busqueda) ||
        (tarea.evento?.titulo || "").toLowerCase().includes(busqueda) ||
        String(tarea.responsable || "").toLowerCase().includes(busqueda);

      return (
        coincideEvento &&
        coincideEstado &&
        coincideBusqueda
      );
    });
  };
  const tareasFiltradas = aplicarFiltros(tareas);
  const gestionesVencidasFiltradas = aplicarFiltros(gestionesVencidas);
  const proximasGestionesFiltradas = aplicarFiltros(proximasGestiones);
  const pendientesFiltradas = tareasFiltradas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "pendiente"
  );

  const pospuestasFiltradas = tareasFiltradas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "pospuesto"
  );

  const completadasFiltradas = tareasFiltradas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "hecho"
  );

  const urgentesFiltradas = [
    ...pospuestasFiltradas,
    ...pendientesFiltradas,
  ];

  const pendientes = tareas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "pendiente"
  );

  const pospuestas = tareas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "pospuesto"
  );

  const completadas = tareas.filter(
    (tarea) => normalizarEstado(tarea.estado) === "hecho"
  );

  const urgentes = [...pospuestas, ...pendientes];

  const horas = tareas.reduce(
    (total, tarea) => total + obtenerHoras(tarea),
    0
  );

  const horasPendientes = obtenerHorasPendientes(tareas);

  const porcentajeCapacidad = Math.min(
    Math.round((horasPendientes / capacidadDiaria) * 100),
    100
  );

  const haySobrecarga = horasPendientes > capacidadDiaria;
  const diasMes = new Date(
    mesCalendario.getFullYear(),
    mesCalendario.getMonth() + 1,
    0
  ).getDate();
  const espaciosAntesDeMes = (new Date(
    mesCalendario.getFullYear(),
    mesCalendario.getMonth(),
    1
  ).getDay() + 6) % 7;
  const diasCalendario = [
    ...Array(espaciosAntesDeMes).fill(null),
    ...Array.from({ length: diasMes }, (_, index) => index + 1),
  ];
  const horasProgramadasEn = (fecha) =>
    subtareasAgenda.reduce((total, subtarea) => {
      if (
        String(subtarea.fechaObjetivo || "").slice(0, 10) !== fecha ||
        String(subtarea.id) === String(tareaPosponer?.id)
      ) {
        return total;
      }
      return total + obtenerHoras(subtarea);
    }, 0);
  const horasAsignadasEnFecha = nuevaFecha
    ? horasProgramadasEn(nuevaFecha) + Number(horasPosposicion || 0)
    : 0;
  const excedeJornadaSeleccionada =
    nuevaFecha && horasAsignadasEnFecha > capacidadDiaria;

  const renderTarea = (tarea, urgente = false) => {
    const estado = normalizarEstado(tarea.estado);
    const hecha = estado === "hecho";
    const titulo = obtenerTituloSubtarea(tarea);
    const nombreEvento = tarea.evento?.titulo || "Evento sin título";
    const horasTarea = obtenerHoras(tarea);
    const seleccionadaActual = seleccionada?.id === tarea.id;
    const nota = obtenerNotaSubtarea(tarea);

    return (
      <article
        className={`today-task-card ${urgente ? "urgent-task" : ""} ${hecha ? "done-task" : ""
          } ${seleccionadaActual ? "selected-task" : ""}`}
        key={tarea.id}
        onClick={() => setSeleccionada(tarea)}
      >
        <div className="today-task-main">
          <div className="today-task-top">
            <span className="today-event-pill">
              Evento: {nombreEvento}
            </span>

            <span className={`today-status status-${estado}`}>
              {hecha ? "✓" : estado === "pospuesto" ? "◷" : "○"}{" "}
              {etiquetaEstado(estado)}
            </span>

            {urgente && !hecha && (
              <span className="today-urgent-badge">
                <span aria-hidden="true">⚠</span> Urgente
              </span>
            )}

            <span className="today-hours">{formatearDuracion(horasTarea)}</span>
          </div>

          <h3>{titulo}</h3>

          <div className="today-task-meta">
            <span>
              📅{" "}
              {estado === "pospuesto" && tarea.dia_objetivo
                ? `Fecha de reprogramación: ${new Intl.DateTimeFormat("es-CO", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(
                  new Date(`${tarea.dia_objetivo}T00:00:00`)
                )}`
                : tarea.dia_objetivo
                  ? "Plazo: Hoy"
                  : tarea.evento?.fecha
                    ? "Evento programado para hoy"
                    : "Sin fecha específica"}
            </span>

            {nota && (
              <>
                {" "}
                <span className="today-task-note">
                  Nota: {nota}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="today-task-actions"
          onClick={(event) => event.stopPropagation()}
        >
          {!hecha ? (
            <>
              <button
                className="today-action-primary"
                type="button"
                disabled={actualizando === tarea.id}
                onClick={() => cambiarEstado(tarea, "hecho")}
              >
                {actualizando === tarea.id
                  ? "Guardando…"
                  : "✓ Marcar como hecho"}
              </button>

              <button
                className="today-action-secondary"
                type="button"
                disabled={actualizando === tarea.id}
                onClick={() => abrirModalPosponer(tarea)}
              >
                Reprogramar
              </button>
            </>
          ) : (
            <span className="today-verified">✓ Realizada</span>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="page today-page">
      <div className="today-header">
        <div>
          <small>
            SEGUIMIENTO DIARIO ·{" "}
            {new Intl.DateTimeFormat("es-CO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </small>
          <div className="today-title-row">
            <h1>Hoy</h1>

            <button
              className="today-refresh-button"
              type="button"
              onClick={cargarHoy}
              disabled={cargando}
              aria-label="Actualizar vista"
              title="Actualizar vista"
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </div>
          <p>Prioriza lo importante y conserva el ritmo.</p>
        </div>

        <div className="today-capacity">
          <span>Capacidad del día </span>
          <strong>
            {formatearDuracion(horasPendientes)} / {formatearDuracion(capacidadDiaria)}
          </strong>

          <div className="today-capacity-track">
            <span style={{ width: `${porcentajeCapacidad}%` }} />
          </div>

          {haySobrecarga && (
            <div className="today-overload-message" role="status">
              Límite de jornada excedido
            </div>
          )}
        </div>
      </div>

      <div className="today-summary-grid">
        <article className="today-summary-card">
          <span className="today-summary-icon">◷</span>
          <div>
            <small>GESTIONES DE HOY</small>
            <strong>{tareas.length}</strong>
            <span>Subtareas programadas</span>
          </div>
        </article>

        <article className="today-summary-card">
          <span className="today-summary-icon">!</span>
          <div>
            <small>PENDIENTES</small>
            <strong>{urgentesFiltradas.length}</strong>
            <span>Requieren atención</span>
          </div>
        </article>

        <article className="today-summary-card">
          <span className="today-summary-icon">✓</span>
          <div>
            <small>REALIZADAS</small>
            <strong>{completadasFiltradas.length}</strong>
            <span>Completadas hoy</span>
          </div>
        </article>

        <article className="today-summary-card">
          <span className="today-summary-icon">◴</span>
          <div>
            <small>TIEMPO ESTIMADO</small>
            <strong>{formatearDuracion(horas)}</strong>
            <span>Duración total estimada</span>
          </div>
        </article>
      </div>
      <div className="today-filters">

        <div className="today-filter-search">
          <span>⌕</span>

          <input
            type="search"
            placeholder="Buscar por evento, tarea o responsable..."
            value={filtroBusqueda}
            onChange={(event) => setFiltroBusqueda(event.target.value)}
          />
        </div>

        <div className="today-filter-select">
          <span>▣</span>

          <select
            value={filtroEvento}
            onChange={(event) => setFiltroEvento(event.target.value)}
          >
            <option value="">
              Todos los eventos ({eventosFiltro.length})
            </option>

            {eventosFiltro.map((evento) => (
              <option key={evento.id} value={evento.id}>
                {evento.titulo}
              </option>
            ))}
          </select>
        </div>

        <div className="today-filter-select">
          <span>☷</span>

          <select
            value={filtroEstado}
            onChange={(event) => setFiltroEstado(event.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="pospuesto">Pospuesto</option>
            <option value="hecho">Hecho</option>
          </select>
        </div>

        <button
          type="button"
          className="today-filter-reset"
          aria-label="Limpiar filtros"
          title="Limpiar filtros"
          onClick={() => {
            setFiltroBusqueda("");
            setFiltroEvento("");
            setFiltroEstado("");
          }}
        >
          <span className="reset-icon">↻</span>
        </button>

      </div>

      <div className="today-layout">
        <main className="today-main-column">
          {cargando && (
            <section className="card state-card">
              <span className="spinner" />
              Cargando…
            </section>
          )}

          {!cargando && error && (
            <section
              className="card state-card error-state"
              role="alert"
            >
              <div>
                <b>No se pudieron cargar las tareas de hoy.</b>
                <p>{error}</p>
              </div>

              <button
                className="btn ghost"
                type="button"
                onClick={cargarHoy}
              >
                Reintentar
              </button>
            </section>
          )}

          {!cargando && !error && tareasFiltradas.length === 0 && gestionesVencidasFiltradas.length === 0 && (
            <section className="card today-no-tasks">
              <div className="empty-icon">⌕</div>

              <h2>
                {filtroBusqueda || filtroEvento || filtroEstado
                  ? "No hay resultados"
                  : "No hay gestiones para hoy"}
              </h2>

              <p>
                {filtroBusqueda || filtroEvento || filtroEstado
                  ? "No encontramos gestiones para hoy que coincidan con los filtros seleccionados."
                  : "No encontramos subtareas cuya fecha objetivo o evento corresponda a hoy."}
              </p>

              {(filtroBusqueda || filtroEvento || filtroEstado) && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setFiltroBusqueda("");
                    setFiltroEvento("");
                    setFiltroEstado("");
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </section>
          )}
          {!cargando && !error && gestionesVencidasFiltradas.length > 0 && (
            <section className="today-overdue-section">

              <div className="today-overdue-header">
                <div>
                  <h2>Gestiones Vencidas</h2>

                  <p className="today-overdue-risk">
                    ⚠ Riesgo operativo acumulado
                  </p>
                </div>

                <span className="today-overdue-count">
                  {gestionesVencidasFiltradas.length}
                </span>
              </div>

              <div className="today-overdue-grid">
                {gestionesVencidasFiltradas.map((tarea) => {
                  const fecha = String(
                    tarea.fechaObjetivo || ""
                  ).slice(0, 10);

                  const fechaVencida = new Date(`${fecha}T00:00:00`);
                  const fechaHoy = new Date(
                    `${obtenerFechaLocalHoy()}T00:00:00`
                  );

                  const diasVencidos = Math.max(
                    1,
                    Math.round(
                      (fechaHoy - fechaVencida) /
                      (1000 * 60 * 60 * 24)
                    )
                  );

                  return (
                    <article
                      className="today-overdue-card"
                      key={tarea.id}
                      onClick={() => setSeleccionada(tarea)}
                    >
                      <div className="today-overdue-main">

                        {/* PARTE SUPERIOR */}
                        <div className="today-overdue-top">

                          <span className="today-event-pill">
                            Evento: {tarea.evento?.titulo || "Evento sin título"}
                          </span>

                          <span className="today-overdue-badge">
                            <span aria-hidden="true">⚠</span>
                            <span className="today-overdue-badge-label">
                              Retraso:
                            </span>
                            {diasVencidos} {diasVencidos === 1 ? "día" : "días"}
                          </span>

                          <span className="today-hours">
                            {formatearDuracion(obtenerHoras(tarea))}
                          </span>

                        </div>

                        {/* TÍTULO */}
                        <h3>
                          {obtenerTituloSubtarea(tarea)}
                        </h3>

                        {/* DESCRIPCIÓN */}
                        {tarea.evento?.descripcion && (
                          <p className="today-overdue-description">
                            {tarea.evento.descripcion}
                          </p>
                        )}

                        {/* FECHA EN QUE VENCIÓ */}
                        <div className="today-overdue-meta">
                          <span>
                            📅 Vencimiento:{" "}
                            {fecha.split("-").reverse().join("/")}
                          </span>
                        </div>

                      </div>

                      {/* ACCIONES */}
                      <div
                        className="today-overdue-actions"
                        onClick={(event) => event.stopPropagation()}
                      >

                        <button
                          type="button"
                          className="today-overdue-resolve"
                          disabled={actualizando === tarea.id}
                          onClick={() => cambiarEstado(tarea, "hecho")}
                        >
                          {actualizando === tarea.id
                            ? "Guardando…"
                            : "✓ Resolver ahora"}
                        </button>

                        <button
                          type="button"
                          className="today-overdue-reprogram"
                          disabled={actualizando === tarea.id}
                          onClick={() => abrirModalPosponer(tarea)}
                        >
                          Reprogramar
                        </button>

                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {!cargando && !error && tareasFiltradas.length > 0 && (
            <>
              <section className="today-section">
                <div className="today-section-title">
                  <div>
                    <h2>Gestiones urgentes</h2>
                    <p>Requiere todavía atención el día de hoy.</p>
                  </div>

                  <span className="today-count urgent-count">
                    {urgentesFiltradas.length}
                  </span>
                </div>

                {urgentes.length === 0 ? (
                  <div className="today-empty">
                    <div className="today-empty-icon">✓</div>
                    <h3>Todo está al día</h3>
                    <p>No tienes gestiones urgentes pendientes para hoy.</p>
                  </div>
                ) : (
                  urgentesFiltradas.map((tarea) => renderTarea(tarea, true))
                )}
              </section>

              <section className="today-section">
                <div className="today-section-title">
                  <div>
                    <h2>Gestiones realizadas hoy</h2>
                  </div>

                  <span className="today-count done-count">
                    {completadasFiltradas.length}
                  </span>
                </div>

                {completadas.length === 0 ? (
                  <div className="today-empty">
                    <span>○</span>
                    <p>Aún no has completado gestiones hoy.</p>
                  </div>
                ) : (
                  completadasFiltradas.map((tarea) => renderTarea(tarea))
                )}
              </section>
            </>
          )}
        </main>

        <aside className="today-side-panel">
          <div className="today-panel-header">
            <small>GESTIÓN SELECCIONADA</small>
            <h2>
              {seleccionada
                ? obtenerTituloSubtarea(seleccionada)
                : "Selecciona una gestión"}
            </h2>
          </div>

          {seleccionada ? (
            <>
              <p className="today-panel-event">
                {seleccionada.evento?.titulo || "Evento sin título"}
              </p>

              <div className="today-panel-info">
                <span>Horas estimadas: </span>
                <strong>{formatearDuracion(obtenerHoras(seleccionada))}</strong>
              </div>

              <div className="today-panel-info">
                <span>Estado: </span>
                <strong>{etiquetaEstado(seleccionada.estado)}</strong>
              </div>

              <div className="today-panel-info">
                <span>Fecha: </span>
                <strong>
                  {seleccionada.dia_objetivo
                    ? formatearFecha(seleccionada.dia_objetivo)
                    : "Hoy"}
                </strong>
              </div>

              <div className="today-panel-info">
                <span>Responsable: </span>
                <strong>
                  {obtenerResponsableSubtarea(seleccionada) || "Sin asignar"}
                </strong>
              </div>

              {obtenerNotaSubtarea(seleccionada) && (
                <div className="today-panel-note">
                  <strong>Nota logística</strong>
                  <p>{obtenerNotaSubtarea(seleccionada)}</p>
                </div>
              )}

              <section className="today-evidence-section" aria-labelledby="today-evidence-title">
                <div className="today-evidence-heading">
                  <FaPaperclip aria-hidden="true" />
                  <div>
                    <h3 id="today-evidence-title">Evidencia (opcional)</h3>
                    <p>Adjunta una imagen de respaldo para esta subtarea.</p>
                  </div>
                </div>

                <input
                  ref={inputEvidenciaRef}
                  className="today-evidence-input"
                  type="file"
                  accept="image/*"
                  aria-label="Seleccionar imagen de evidencia"
                  disabled={subiendoEvidencia || actualizando === seleccionada.id}
                  onChange={(event) => {
                    seleccionarEvidencia(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />

                {(vistaPreviaEvidencia || seleccionada.comprobante_url) && (
                  <div className="today-evidence-preview">
                    <img
                      src={vistaPreviaEvidencia || seleccionada.comprobante_url}
                      alt={archivoEvidencia?.name || "Evidencia guardada de la subtarea"}
                    />
                    <div className="today-evidence-file">
                      <strong>
                        {archivoEvidencia?.name || "Evidencia guardada"}
                      </strong>
                      <span>
                        {archivoEvidencia
                          ? `${(archivoEvidencia.size / (1024 * 1024)).toFixed(2)} MB · Lista para cargar`
                          : "Disponible"}
                      </span>
                    </div>
                    {seleccionada.comprobante_url && !archivoEvidencia && (
                      <a
                        className="today-evidence-open"
                        href={seleccionada.comprobante_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver
                      </a>
                    )}
                  </div>
                )}

                {archivoEvidencia ? (
                  <div className="today-evidence-actions">
                    <button
                      className="today-panel-secondary"
                      type="button"
                      disabled={subiendoEvidencia}
                      onClick={() => inputEvidenciaRef.current?.click()}
                    >
                      Reemplazar archivo
                    </button>
                    <button
                      className="today-evidence-remove"
                      type="button"
                      disabled={subiendoEvidencia}
                      onClick={() => setArchivoEvidencia(null)}
                    >
                      Quitar selección
                    </button>
                    <button
                      className="btn primary today-evidence-upload"
                      type="button"
                      disabled={subiendoEvidencia}
                      onClick={guardarEvidencia}
                    >
                      {subiendoEvidencia ? "Subiendo evidencia..." : "Guardar evidencia"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="today-panel-secondary today-evidence-choose"
                    type="button"
                    disabled={subiendoEvidencia || actualizando === seleccionada.id}
                    onClick={() => inputEvidenciaRef.current?.click()}
                  >
                    <FaImage aria-hidden="true" />
                    {subiendoEvidencia
                      ? "Subiendo evidencia..."
                      : seleccionada.comprobante_url
                        ? "Reemplazar"
                        : "Adjuntar imagen"}
                  </button>
                )}

                {errorEvidencia && (
                  <p className="today-evidence-error" role="alert">
                    {errorEvidencia}
                  </p>
                )}
              </section>

              {normalizarEstado(seleccionada.estado) !== "hecho" ? (
                <>
                  <button
                    className="today-register-button"
                    type="button"
                    disabled={
                      actualizando === seleccionada.id ||
                      subiendoEvidencia ||
                      Boolean(archivoEvidencia)
                    }
                    onClick={() => cambiarEstado(seleccionada, "hecho")}
                  >
                    {subiendoEvidencia
                      ? "Guardando evidencia..."
                      : actualizando === seleccionada.id
                      ? "Guardando…"
                      : "Marcar como hecho"}
                  </button>

                  <button
                    className="today-panel-secondary"
                    type="button"
                    disabled={
                      actualizando === seleccionada.id || subiendoEvidencia
                    }
                    onClick={() => abrirModalPosponer(seleccionada)}
                  >
                    Reprogramar gestión
                  </button>
                </>
              ) : (
                <div className="today-panel-success">
                  ✓ Gestión realizada
                </div>
              )}

              {seleccionada.evento?.id && (
                <button
                  className="today-panel-cancel"
                  type="button"
                  onClick={() =>
                    navegar(`/eventos/${seleccionada.evento.id}`)
                  }
                >
                  Ver evento
                </button>
              )}
            </>
          ) : (
            <p className="today-panel-empty">
              Selecciona una gestión para consultar sus detalles y registrar
              su ejecución.
            </p>
          )}
        </aside>
      </div>
      <section className="today-upcoming-section">
        <div className="today-upcoming-header">
          <div>
            <h2>Próximas gestiones</h2>
            <p>Ten presentes las gestiones programadas para los próximos días.</p>
          </div>

          <span className="today-upcoming-count">
            {proximasGestiones.length}
          </span>
        </div>

        {proximasGestionesFiltradas.length === 0 ? (
          <div className="today-upcoming-empty">
            <span>✓</span>
            <p>No hay tareas programadas.</p>
          </div>
        ) : (
          <div className="today-upcoming-list">
              {proximasGestionesFiltradas.map((tarea) => {
              const fecha = String(tarea.fechaObjetivo || "").slice(0, 10);

              const fechaTarea = new Date(`${fecha}T00:00:00`);
              const fechaHoy = new Date(
                `${obtenerFechaLocalHoy()}T00:00:00`
              );

              const diferenciaDias = Math.round(
                (fechaTarea - fechaHoy) / (1000 * 60 * 60 * 24)
              );

              const nota = obtenerNotaSubtarea(tarea);

              return (
                <article
                  className="today-upcoming-card"
                  key={tarea.id}
                  onClick={() => setSeleccionada(tarea)}
                >
                  <div className="today-upcoming-days">
                    <strong>+{diferenciaDias}</strong>
                    <span>día{diferenciaDias !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="today-upcoming-main">
                    <h3>{obtenerTituloSubtarea(tarea)}</h3>

                    <div className="today-upcoming-meta">
                      <span>
                        📅{" "}
                        {tarea.evento?.titulo || "Evento sin título"}
                      </span>

                      <span>•</span>

                      <span>
                        {formatearFecha(tarea.fechaObjetivo)}
                      </span>

                      {nota && (
                        <>
                          <span>•</span>

                          <span className="today-upcoming-note">
                            Nota: {nota}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="today-upcoming-hours">
                    {formatearDuracion(obtenerHoras(tarea))}
                  </div>

                  <span className="today-upcoming-arrow">
                    Ver detalles →
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {tareaPosponer && !conflictoJornada && (
        <div className="postpone-overlay">
          <div
            className="postpone-modal postpone-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="postpone-title"
          >
            <button
              type="button"
              className="postpone-close"
              onClick={() => setTareaPosponer(null)}
              disabled={guardandoPosposicion}
              aria-label="Cerrar"
            >
              ×
            </button>

            <div className="postpone-task-summary">
              <span className="postpone-task-icon">✦</span>
              <div>
                <small>
                  {tareaPosponer.evento?.titulo || "Evento"}
                  {tareaPosponer.evento?.estado
                    ? ` · ${tareaPosponer.evento.estado}`
                    : ""}
                </small>
                <strong>{obtenerTituloSubtarea(tareaPosponer)}</strong>
                <span>
                  Responsable:
                  {" "}
                  {tareaPosponer.responsable ||
                    tareaPosponer.evento?.usuario_responsable ||
                    "Sin asignar"}
                </span>
              </div>
              <span className="postpone-original-date">
                ORIGINAL:{" "}
                <strong>
                  {formatearFecha(
                    tareaPosponer.dia_objetivo || tareaPosponer.fechaObjetivo
                  )}
                </strong>
              </span>
            </div>

            <div className="postpone-calendar-heading">
              <h3>
                <span aria-hidden="true">📅</span>{" "}
                {new Intl.DateTimeFormat("es-CO", {
                  month: "long",
                  year: "numeric",
                }).format(mesCalendario)}
              </h3>
              <div>
                <button
                  type="button"
                  aria-label="Mes anterior"
                  disabled={
                    mesCalendario.getFullYear() === new Date().getFullYear() &&
                    mesCalendario.getMonth() === new Date().getMonth()
                  }
                  onClick={() =>
                    setMesCalendario(
                      new Date(
                        mesCalendario.getFullYear(),
                        mesCalendario.getMonth() - 1,
                        1
                      )
                    )
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="postpone-today-link"
                  onClick={() => {
                    const hoy = new Date();
                    setMesCalendario(
                      new Date(hoy.getFullYear(), hoy.getMonth(), 1)
                    );
                    setNuevaFecha(obtenerFechaLocalHoy());
                  }}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() =>
                    setMesCalendario(
                      new Date(
                        mesCalendario.getFullYear(),
                        mesCalendario.getMonth() + 1,
                        1
                      )
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>

            <div className="postpone-calendar" aria-label="Seleccionar fecha">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                (dia) => (
                  <span className="postpone-weekday" key={dia}>
                    {dia}
                  </span>
                )
              )}
              {diasCalendario.map((dia, index) => {
                if (!dia) {
                  return <span className="postpone-day-spacer" key={`empty-${index}`} />;
                }

                const fecha = [
                  mesCalendario.getFullYear(),
                  String(mesCalendario.getMonth() + 1).padStart(2, "0"),
                  String(dia).padStart(2, "0"),
                ].join("-");
                const horasDelDia = horasProgramadasEn(fecha);
                const fechaPasada = fecha < obtenerFechaLocalHoy();
                const fechaFueraDeRango =
                  Boolean(fechaLimitePosponer) &&
                  fecha > fechaLimitePosponer;
                const fechaNoSeleccionable =
                  fechaPasada || fechaFueraDeRango;
                const seleccionada = nuevaFecha === fecha;
                return (
                  <button
                    type="button"
                    className={`postpone-calendar-day ${seleccionada ? "selected" : ""} ${fechaNoSeleccionable ? "past" : ""} ${horasDelDia >= capacidadDiaria ? "full" : ""}`}
                    key={fecha}
                    disabled={fechaNoSeleccionable || guardandoPosposicion}
                    aria-pressed={seleccionada}
                    onClick={() => setNuevaFecha(fecha)}
                  >
                    <span>{dia}</span>
                    <small>{formatearDuracion(horasDelDia)}/{formatearDuracion(capacidadDiaria)}</small>
                  </button>
                );
              })}
            </div>

            {excedeJornadaSeleccionada && (
              <div className="postpone-overload-inline" role="alert">
                <strong>⚠</strong>
                <span>
                  {formatearFecha(nuevaFecha)} supera tu jornada diaria:{" "}
                  {formatearDuracion(horasAsignadasEnFecha)} acumuladas frente a{" "}
                  {formatearDuracion(capacidadDiaria)} de tope.
                </span>
              </div>
            )}

            <div className="postpone-fields-row">
              <div className="postpone-field postpone-hours-field">
                <label htmlFor="horas-reprogramacion-hours">
                  Duración estimada de ejecución
                </label>
                <div className="postpone-hours-control">
                  <button
                    type="button"
                    aria-label="Reducir duración"
                    disabled={guardandoPosposicion || horasPosposicion <= (1 / 60)}
                    onClick={() =>
                      setHorasPosposicion((horas) =>
                        Math.max(1 / 60, redondearHoras(Number(horas) - 0.5))
                      )
                    }
                  >
                    −
                  </button>
                  <div className="postpone-duration-editor">
                    <DurationInput
                      id="horas-reprogramacion"
                      name="horas_reprogramacion"
                      value={horasPosposicion}
                      onChange={(event) => {
                        const valor = event.target.value;
                        setHorasPosposicion(valor === "" ? "" : Number(valor));
                      }}
                      disabled={guardandoPosposicion}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Aumentar duración"
                    disabled={guardandoPosposicion || horasPosposicion >= 24}
                    onClick={() =>
                      setHorasPosposicion((horas) =>
                        Math.min(24, redondearHoras(Number(horas) + 0.5))
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <small>Base: {formatearDuracion(obtenerHoras(tareaPosponer))}</small>
              </div>

              <StitchOptionalSection
                id="postpone-note"
                className="postpone-note-section"
                icon={<FaRegFileAlt />}
                title="Agregar nota"
                defaultOpen
              >
                <label htmlFor="nota-posposicion">Nota</label>
                <textarea
                  id="nota-posposicion"
                  ref={notaPosponerRef}
                  value={notaPosposicion}
                  onChange={(event) =>
                    setNotaPosposicion(event.target.value)
                  }
                  onInput={ajustarNotaPosponer}
                  disabled={guardandoPosposicion}
                  placeholder="Añade una nota sobre la reprogramación (opcional)"
                  rows={3}
                  maxLength={300}
                />
              </StitchOptionalSection>
            </div>

            <div className="postpone-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setTareaPosponer(null);
                  setNuevaFecha("");
                  setNotaPosposicion("");
                }}
                disabled={guardandoPosposicion}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn primary"
                onClick={confirmarPosposicion}
                disabled={
                  !nuevaFecha ||
                  !horasPosposicion ||
                  guardandoPosposicion
                }
              >
                {guardandoPosposicion
                  ? "Reprogramando…"
                  : "Confirmar y verificar agenda"}
              </button>
            </div>
          </div>
        </div>
      )}
      {conflictoJornada && tareaPosponer && (
        <ModalResolucionSobrecarga
          key={`${conflictoJornada.fecha_objetivo}-${conflictoJornada.horas_asignadas}-${conflictoJornada.fecha_recomendada || ""}`}
          conflicto={conflictoJornada}
          horasCausa={horasPosposicion}
          tituloCausa={obtenerTituloSubtarea(tareaPosponer)}
          guardando={guardandoPosposicion}
          onCancelar={() => {
            setConflictoJornada(null);
            setTareaPosponer(null);
            setEstadoResolucionJornada("pospuesto");
          }}
          onAccion={aplicarResolucionSobrecarga}
        />
      )}
    </section>
  );
}

// ============================================================
// PROGRESO — cálculo en el frontend
// ------------------------------------------------------------
// La vista de Progreso consolida el avance de todos los eventos. Por
// ahora el cálculo se hace en el cliente combinando los datos de
// `GET /eventos` y `GET /subtareas`, el mismo patrón que ya usa la
// vista Hoy. Si el equipo de backend habilita el listado enriquecido
// (indicadores por evento en `GET /eventos`), basta reemplazar el
// cuerpo de `calcularProgreso` para consumir esos campos; el resto
// del componente no cambia.
// ============================================================

// El estado de cada subtarea lo decide `estadoEfectivoSubtarea`, la misma
// regla que usan /hoy y /eventos/:id.
//
// Las categorías son DISJUNTAS: cada subtarea cuenta una sola vez, así la
// suma de estados nunca supera el total de subtareas del evento.
// Prioridad: hecho -> vencida -> pospuesta -> pendiente.
function calcularProgreso(eventos, subtareas) {
  const hoy = obtenerFechaLocalHoy();
  const subtareasPorEvento = new Map();

  subtareas.forEach((subtarea) => {
    const clave = String(subtarea.evento_id);
    const lista = subtareasPorEvento.get(clave) || [];
    lista.push(subtarea);
    subtareasPorEvento.set(clave, lista);
  });

  let total = 0;
  let completadas = 0;
  let vencidas = 0;
  let pospuestas = 0;
  let pendientes = 0;

  const detalleEventos = eventos.map((evento) => {
    const lista = (subtareasPorEvento.get(String(evento.id)) || []).slice();
    const totalEvento = lista.length;

    let completadasEvento = 0;
    let vencidasEvento = 0;
    let pospuestasEvento = 0;
    let pendientesEvento = 0;

    lista.forEach((item) => {
      const estado = estadoEfectivoSubtarea(item, hoy);

      if (estado === "hecho") {
        completadasEvento += 1;
      } else if (estado === "vencido") {
        vencidasEvento += 1;
      } else if (estado === "pospuesto") {
        pospuestasEvento += 1;
      } else {
        pendientesEvento += 1;
      }
    });

    const porcentaje = totalEvento
      ? Math.round((completadasEvento / totalEvento) * 100)
      : 0;

    total += totalEvento;
    completadas += completadasEvento;
    vencidas += vencidasEvento;
    pospuestas += pospuestasEvento;
    pendientes += pendientesEvento;

    return {
      id: evento.id,
      titulo: evento.titulo,
      fecha: evento.fecha,
      estado: derivarEstadoEvento(porcentaje, totalEvento),
      porcentaje,
      total: totalEvento,
      completadas: completadasEvento,
      vencidas: vencidasEvento,
      pospuestas: pospuestasEvento,
      pendientes: pendientesEvento,
    };
  });

  const porcentajeGlobal = total
    ? Math.round((completadas / total) * 100)
    : 0;

  return {
    resumen: {
      total,
      completadas,
      vencidas,
      pospuestas,
      pendientes,
      porcentaje: porcentajeGlobal,
    },
    eventos: detalleEventos,
  };
}

// El modelo de evento no tiene un campo `estado` persistido, así que el
// distintivo se deriva del porcentaje de avance mientras el equipo de
// backend define el origen real.
function derivarEstadoEvento(porcentaje, total) {
  if (total > 0 && porcentaje === 100) {
    return { clave: "completado", etiqueta: "Completado" };
  }

  if (porcentaje > 0) {
    return { clave: "preparacion", etiqueta: "En preparación" };
  }

  return { clave: "planificacion", etiqueta: "Planificación" };
}

function Progreso({ busquedaEventos = "", onLimpiarBusqueda, recargaToken = 0 }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState({ resumen: null, eventos: [] });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  // "asc" | "desc" | "fecha"
  const [orden, setOrden] = useState("desc");
  const [subtareasCalendario, setSubtareasCalendario] = useState([]);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [fechaCalendario, setFechaCalendario] = useState(obtenerFechaLocalHoy());
  const [vistaCalendario, setVistaCalendario] = useState("mes");
  const [mesCalendarioProgreso, setMesCalendarioProgreso] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

  const cargar = async () => {
    setCargando(true);
    setError("");

    try {
      const [eventosData, subtareasData] = await Promise.all([
        obtenerEventos(),
        obtenerSubtareas(),
      ]);

      const eventos = Array.isArray(eventosData) ? eventosData : [];
      const subtareas = Array.isArray(subtareasData) ? subtareasData : [];
      setSubtareasCalendario(subtareas);

      setDatos(calcularProgreso(eventos, subtareas));
    } catch (errorActual) {
      setError(
        errorActual.message ||
          "No fue posible cargar el progreso de los eventos."
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [recargaToken]);

  // Los vencimientos dependen del día local, así que al cruzar la medianoche
  // los contadores y las etiquetas quedan obsoletos aunque la pestaña siga
  // abierta. Se revisa el día periódicamente y solo se vuelve a consultar el
  // backend cuando cambia de verdad; `visibilitychange` solo adelanta esa
  // comprobación, no es quien la dispara.
  useEffect(() => {
    let diaVisto = obtenerFechaLocalHoy();

    const comprobarDia = () => {
      const dia = obtenerFechaLocalHoy();

      if (dia === diaVisto) return;

      diaVisto = dia;
      cargar();
    };

    const intervalo = setInterval(comprobarDia, 60000);

    document.addEventListener("visibilitychange", comprobarDia);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", comprobarDia);
    };
  }, []);

  const { resumen } = datos;

  // La búsqueda de la cabecera filtra los eventos dentro de esta pestaña.
  const termino = busquedaEventos.trim().toLocaleLowerCase("es");
  const eventosFiltrados = datos.eventos.filter((evento) =>
    String(evento.titulo || "")
      .toLocaleLowerCase("es")
      .includes(termino)
  );

  const porcentajeDe = (evento) => {
    const valor = Number(evento?.porcentaje);

    return Number.isFinite(valor) ? valor : 0;
  };

  // Fecha del evento convertida a número para comparar fechas reales y no
  // texto. Devuelve `null` cuando el evento no tiene una fecha utilizable.
  const fechaOrdenDe = (evento) => {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(evento?.fecha || "").slice(0, 10)
    );

    if (!partes) return null;

    return (
      Number(partes[1]) * 10000 + Number(partes[2]) * 100 + Number(partes[3])
    );
  };

  // Desempate estable para que dos elementos con la misma clave terminen
  // siempre en el mismo orden entre recargas.
  const desempateEventos = (a, b) =>
    (Number(b?.total) || 0) - (Number(a?.total) || 0) ||
    String(a?.titulo || "").localeCompare(String(b?.titulo || ""), "es") ||
    String(a?.id || "").localeCompare(String(b?.id || ""));

  const ordenarEventos = (lista) => {
    const copia = lista.slice();

    if (orden === "asc") {
      return copia.sort(
        (a, b) => porcentajeDe(a) - porcentajeDe(b) || desempateEventos(a, b)
      );
    }

    if (orden === "fecha") {
      // "Fecha: más recientes" muestra primero lo más próximo o actual (hoy)
      // y después los siguientes; los más lejanos quedan al final.
      return copia.sort((a, b) => {
        const fechaA = fechaOrdenDe(a);
        const fechaB = fechaOrdenDe(b);

        // Sin fecha utilizable el evento se queda al final del listado.
        if (fechaA === null && fechaB === null) return desempateEventos(a, b);
        if (fechaA === null) return 1;
        if (fechaB === null) return -1;

        return fechaA - fechaB || desempateEventos(a, b);
      });
    }

    return copia.sort(
      (a, b) => porcentajeDe(b) - porcentajeDe(a) || desempateEventos(a, b)
    );
  };

  const eventos = ordenarEventos(eventosFiltrados);

  const etiquetasOrden = {
    desc: "Mayor porcentaje",
    asc: "Menor porcentaje",
    fecha: "Fecha: más recientes",
  };

  const opcionesOrden = [
    { clave: "desc", etiqueta: "Mayor porcentaje" },
    { clave: "asc", etiqueta: "Menor porcentaje" },
    { clave: "fecha", etiqueta: "Fecha: más recientes" },
  ];

  const [categoriaSubtareasActiva, setCategoriaSubtareasActiva] = useState(null);
  const panelSubtareasRef = useRef(null);

  const subtareasPorCategoria = useMemo(() => {
    const base = {
      completadas: [],
      pendientes: [],
      pospuestas: [],
      vencidas: [],
    };

    subtareasCalendario.forEach((subtarea) => {
      const estado = estadoEfectivoSubtarea(subtarea);
      const categoria = {
        hecho: "completadas",
        pendiente: "pendientes",
        pospuesto: "pospuestas",
        vencido: "vencidas",
      }[estado];
      if (categoria) base[categoria].push(subtarea);
    });

    return base;
  }, [subtareasCalendario]);

  const categoriasSubtareas = [
    {
      clave: "completadas",
      titulo: "Completadas",
      descripcion: "Gestiones ejecutadas",
      clase: "stat-done",
      icono: <FaCheckCircle aria-hidden="true" />,
      etiquetaEstado: "Completada",
    },
    {
      clave: "pendientes",
      titulo: "Pendientes",
      descripcion: "En ritmo ordinario",
      clase: "stat-pending",
      icono: <FaClock aria-hidden="true" />,
      etiquetaEstado: "Pendiente",
    },
    {
      clave: "pospuestas",
      titulo: "Pospuestas",
      descripcion: "Reprogramadas",
      clase: "stat-postponed",
      icono: <FaClock aria-hidden="true" />,
      etiquetaEstado: "Pospuesta",
    },
    {
      clave: "vencidas",
      titulo: "Vencidas",
      descripcion: "Requieren atención",
      clase: "stat-risk",
      icono: <FaExclamationTriangle aria-hidden="true" />,
      etiquetaEstado: "Vencida",
    },
  ];

  const activarCategoriaSubtareas = (categoria) => {
    setCategoriaSubtareasActiva((actual) =>
      actual === categoria ? null : categoria
    );
  };

  useEffect(() => {
    const manejarClicFuera = (event) => {
      if (!categoriaSubtareasActiva) return;

      const panel = panelSubtareasRef.current;
      const elemento = event.target instanceof Element ? event.target : null;
      const cardActiva = elemento?.closest(".progress-stat-card");

      if (!panel?.contains(elemento) && !cardActiva) {
        setCategoriaSubtareasActiva(null);
      }
    };

    document.addEventListener("mousedown", manejarClicFuera);
    return () => document.removeEventListener("mousedown", manejarClicFuera);
  }, [categoriaSubtareasActiva]);

  const contenidoCategoriaSubtareas =
    categoriaSubtareasActiva ? subtareasPorCategoria[categoriaSubtareasActiva] : [];
  const fechaSeleccionadaCalendario = new Date(`${fechaCalendario}T12:00:00`);
  const inicioSemanaCalendario = new Date(fechaSeleccionadaCalendario);
  inicioSemanaCalendario.setDate(
    inicioSemanaCalendario.getDate() -
      ((inicioSemanaCalendario.getDay() + 6) % 7)
  );
  const diasVisiblesCalendario =
    vistaCalendario === "semana"
      ? Array.from({ length: 7 }, (_, index) => {
          const date = new Date(inicioSemanaCalendario);
          date.setDate(date.getDate() + index);
          return {
            fecha: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
            dia: date.getDate(),
            mesActual: date.getMonth() === mesCalendarioProgreso.getMonth(),
          };
        })
      : Array.from(
          {
            length:
              (mesCalendarioProgreso.getDay() + 6) % 7 +
              new Date(
                mesCalendarioProgreso.getFullYear(),
                mesCalendarioProgreso.getMonth() + 1,
                0
              ).getDate(),
          },
          (_, index) => {
            const primerDia = (mesCalendarioProgreso.getDay() + 6) % 7;
            if (index < primerDia) return null;
            const dia = index - primerDia + 1;
            return {
              fecha: `${mesCalendarioProgreso.getFullYear()}-${String(mesCalendarioProgreso.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
              dia,
              mesActual: true,
            };
          }
        );
  const eventosDelDiaSeleccionado = datos.eventos.filter(
    (evento) => String(evento.fecha || "").slice(0, 10) === fechaCalendario
  );
  const subtareasDelDiaSeleccionado = subtareasCalendario.filter(
    (subtarea) => obtenerFechaObjetivo(subtarea) === fechaCalendario
  );
  const minutosEstimadosDia = sumarMinutosEstimados(subtareasDelDiaSeleccionado);
  const navegarCalendario = (direccion) => {
    const fechaBase =
      vistaCalendario === "semana"
        ? new Date(fechaSeleccionadaCalendario)
        : new Date(
            mesCalendarioProgreso.getFullYear(),
            mesCalendarioProgreso.getMonth(),
            1,
            12
          );
    if (vistaCalendario === "semana") {
      fechaBase.setDate(fechaBase.getDate() + direccion * 7);
    } else {
      fechaBase.setMonth(fechaBase.getMonth() + direccion);
    }
    const fechaNueva = `${fechaBase.getFullYear()}-${String(fechaBase.getMonth() + 1).padStart(2, "0")}-${String(fechaBase.getDate()).padStart(2, "0")}`;
    setFechaCalendario(fechaNueva);
    setMesCalendarioProgreso(new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1));
  };

  return (
    <section className="page progress-page">
      <div className="progress-header">
        <div>
          <div className="progress-title-row">
            <h1>Progreso</h1>
            <span className="progress-events-badge">
              {datos.eventos.length}{" "}
              {datos.eventos.length === 1
                ? "evento registrado"
                : "eventos registrados"}
            </span>
          </div>
          <p>
            Consulta y monitorea el avance en tiempo real de todos los eventos
            logísticos y sus subtareas.
          </p>
        </div>

        <div className="progress-filters">
          <button
            className="btn secondary progress-filters-button"
            type="button"
            onClick={() => setMostrarFiltros((valor) => !valor)}
            aria-expanded={mostrarFiltros}
          >
            <FaFilter aria-hidden="true" />
            Filtros avanzados
          </button>

          {mostrarFiltros && (
            <div
              className="progress-filters-panel"
              role="group"
              aria-label="Ordenar eventos"
            >
              {opcionesOrden.map((opcion) => (
                <button
                  key={opcion.clave}
                  type="button"
                  className={`progress-filter-option ${
                    orden === opcion.clave ? "active" : ""
                  }`}
                  aria-pressed={orden === opcion.clave}
                  onClick={() => {
                    setOrden(opcion.clave);
                    setMostrarFiltros(false);
                  }}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {cargando && (
        <section className="card state-card">
          <span className="spinner" /> Cargando progreso...
        </section>
      )}

      {!cargando && error && (
        <section className="card state-card error-state" role="alert">
          <div>
            <b>No se pudo cargar el progreso.</b>
            <p>{error}</p>
          </div>

          <button className="btn ghost" type="button" onClick={cargar}>
            Reintentar
          </button>
        </section>
      )}

      {!cargando && !error && resumen && (
        <>
          {resumen.total === 0 ? (
            <section className="card state-card empty-state progress-empty-state">
              <div className="empty-icon progress-empty-icon" aria-hidden="true">
                <FaChartLine />
              </div>
              <h2>
                {datos.eventos.length === 0
                  ? "Aún no hay eventos"
                  : "Aún no hay subtareas"}
              </h2>
              <p>
                {datos.eventos.length === 0
                  ? "Crea tu primer evento y organiza tus actividades para empezar a seguir el progreso."
                  : "Agrega subtareas a tus eventos para empezar a medir el avance."}
              </p>
              {datos.eventos.length === 0 && (
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navegar("/crear-evento")}
                >
                  Crear el primer evento
                </button>
              )}
            </section>
          ) : (
            <>
              <section className="card progress-rendimiento">
                <div
                  className="progress-ring"
                  role="img"
                  aria-label={`Progreso general ${resumen.porcentaje} por ciento`}
                >
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle
                      className="progress-ring-bg"
                      cx="60"
                      cy="60"
                      r="52"
                    />
                    <circle
                      className="progress-ring-fill"
                      cx="60"
                      cy="60"
                      r="52"
                      style={{
                        strokeDasharray: 2 * Math.PI * 52,
                        strokeDashoffset:
                          2 * Math.PI * 52 * (1 - resumen.porcentaje / 100),
                      }}
                    />
                  </svg>
                  <strong>{resumen.porcentaje}%</strong>
                  <small>GLOBAL</small>
                </div>

                <div className="progress-rendimiento-info">
                  <h2>Progreso general</h2>
                  <p>
                    {resumen.completadas} de {resumen.total} subtareas
                    completadas en activo.
                  </p>
                  <div className="progress-track progress-track-lg">
                    <span style={{ width: `${resumen.porcentaje}%` }} />
                  </div>
                </div>

                <div className="progress-rendimiento-stats">
                  {categoriasSubtareas.map((categoria) => {
                    const activa = categoriaSubtareasActiva === categoria.clave;
                    const cantidad = subtareasPorCategoria[categoria.clave].length;
                    const porcentaje = subtareasCalendario.length
                      ? Math.round((cantidad / subtareasCalendario.length) * 100)
                      : 0;
                    return (
                      <button
                        key={categoria.clave}
                        type="button"
                        className={`progress-stat-card ${categoria.clase}${activa ? " selected" : ""}`}
                        aria-pressed={activa}
                        aria-expanded={activa}
                        aria-controls={activa ? "progress-status-panel" : undefined}
                        onClick={() => activarCategoriaSubtareas(categoria.clave)}
                      >
                        <small>{categoria.titulo.toUpperCase()}</small>
                        <div className="progress-stat-figure">
                          <span className="progress-stat-icon">{categoria.icono}</span>
                          <strong>{cantidad}</strong>
                        </div>
                        <span>{categoria.clave === "completadas" ? `${porcentaje}% del total` : categoria.descripcion}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {categoriaSubtareasActiva && (
                  <div
                    id="progress-status-panel"
                    className="progress-status-panel"
                    ref={panelSubtareasRef}
                    role="region"
                    aria-live="polite"
                    aria-label={`Subtareas ${categoriaSubtareasActiva}`}
                  >
                    {cargando ? (
                      <div className="progress-status-state">
                        <span className="spinner" /> Cargando subtareas...
                      </div>
                    ) : error ? (
                      <div className="progress-status-state error" role="alert">
                        No se pudieron cargar las subtareas de esta categoría.
                      </div>
                    ) : contenidoCategoriaSubtareas.length === 0 ? (
                      <div className="progress-status-state empty">
                        <strong>No hay subtareas {categoriasSubtareas.find((item) => item.clave === categoriaSubtareasActiva)?.titulo.toLowerCase()}.</strong>
                        <span>Los registros aparecerán aquí cuando existan.</span>
                      </div>
                    ) : (
                      <div className="progress-status-list">
                        {contenidoCategoriaSubtareas.map((subtarea, index) => {
                          const evento = datos.eventos.find(
                            (item) => String(item.id) === String(subtarea.evento_id)
                          );
                          const nota = obtenerNotaSubtarea(subtarea);
                          const responsable = obtenerResponsableSubtarea(subtarea);
                          const categoria = categoriasSubtareas.find(
                            (item) => item.clave === categoriaSubtareasActiva
                          );

                          return (
                            <article
                              className="progress-status-item"
                              key={
                                subtarea.id ?? `${subtarea.evento_id}-${subtarea.titulo ?? "subtarea"}-${index}`
                              }
                            >
                              <div className="progress-status-item-main">
                                <span className={`progress-status-item-tag ${categoria?.clase || ""}`}>
                                  {categoria?.etiquetaEstado}
                                </span>
                                <h3>{subtarea.titulo || subtarea.nombre || "Subtarea sin nombre"}</h3>
                                <p className="progress-status-event">
                                  Evento: {evento?.titulo || "Evento no asociado"}
                                </p>
                                <div className="progress-status-meta">
                                  <span>Fecha: {subtarea.dia_objetivo ? formatearFecha(subtarea.dia_objetivo) : "Sin fecha"}</span>
                                  <span>Responsable: {responsable || "Sin asignar"}</span>
                                  <span>Estimado: {formatearDuracion(obtenerHoras(subtarea))}</span>
                                </div>
                                {nota && <p className="progress-status-note">{nota}</p>}
                              </div>
                              {evento?.id && (
                                <button
                                  className="progress-status-event-link"
                                  type="button"
                                  onClick={() => navegar(`/eventos/${evento.id}`)}
                                >
                                  Ver evento →
                                </button>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
              )}

              <section className="progress-breakdown">
                <div className="progress-breakdown-header">
                  <h2>Eventos</h2>
                  <span className="progress-breakdown-order">
                    Ordenado por: {etiquetasOrden[orden]}
                  </span>
                </div>

                {eventos.length === 0 ? (
                  <div className="progress-no-results card">
                    <div className="empty-icon">⌕</div>
                    <h3>
                      {termino
                        ? "No se encontraron eventos con esa búsqueda"
                        : "Todavía no hay eventos para mostrar"}
                    </h3>
                    <p>
                      {termino
                        ? `Ninguno de tus ${datos.eventos.length} ${
                            datos.eventos.length === 1
                              ? "evento registrado"
                              : "eventos registrados"
                          } coincide con "${busquedaEventos.trim()}".`
                        : "Crea un evento para empezar a medir su avance."}
                    </p>

                    {termino && onLimpiarBusqueda && (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={onLimpiarBusqueda}
                      >
                        Limpiar búsqueda
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="progress-breakdown-grid">
                    {eventos.map((evento) => (
                      <article
                        className="progress-event-card card"
                        key={evento.id ?? evento.titulo}
                      >
                        <div className="progress-event-top">
                          <h3>{evento.titulo}</h3>
                          <span
                            className={`progress-event-badge badge-${evento.estado.clave}`}
                          >
                            {evento.estado.etiqueta}
                          </span>
                        </div>

                        <span className="progress-event-date">
                          {formatearFecha(evento.fecha)}
                        </span>

                        <div className="progress-event-row">
                          <span>Progreso acumulado</span>
                          <strong>{evento.porcentaje}%</strong>
                        </div>

                        <div
                          className="progress-event-bar"
                          role="progressbar"
                          aria-valuenow={evento.porcentaje}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progreso de ${evento.titulo}`}
                        >
                          <span style={{ width: `${evento.porcentaje}%` }} />
                        </div>

                        <p className="progress-event-count">
                          {evento.completadas} de {evento.total} subtareas
                          realizadas
                        </p>

                        <div className="progress-event-tags">
                          {evento.pospuestas > 0 && (
                            <span className="progress-tag tag-postponed">
                              {evento.pospuestas} pospuesta
                              {evento.pospuestas !== 1 ? "s" : ""}
                            </span>
                          )}

                          {evento.pendientes > 0 && (
                            <span className="progress-tag tag-pending">
                              {evento.pendientes} pendiente
                              {evento.pendientes !== 1 ? "s" : ""}
                            </span>
                          )}

                          {evento.vencidas > 0 && (
                            <span className="progress-tag tag-risk">
                              {evento.vencidas} vencida
                              {evento.vencidas !== 1 ? "s" : ""}
                            </span>
                          )}

                          {evento.total > 0 && evento.porcentaje === 100 && (
                            <span className="progress-tag tag-done">
                              ✓ Listo para ejecución
                            </span>
                          )}
                        </div>

                        <button
                          className="btn secondary progress-event-detail"
                          type="button"
                          onClick={() => navegar(`/eventos/${evento.id}`)}
                        >
                          Ver detalle →
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      <button
        className="progress-calendar-fab"
        type="button"
        onClick={() => setMostrarCalendario(true)}
        aria-label="Abrir calendario de progreso"
        title="Ver calendario"
      >
        <FaCalendarAlt aria-hidden="true" />
      </button>

      {mostrarCalendario && (
        <div className="progress-calendar-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setMostrarCalendario(false); }}>
          <section className="progress-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="progress-calendar-title">
            <header className="progress-calendar-modal-header">
              <div>
                <span className="progress-calendar-eyebrow">EVENTHUB · PLANIFICACIÓN</span>
                <h2 id="progress-calendar-title">Calendario de Progreso y Entregas</h2>
                <p>Consulta fechas, hitos y gestiones de tus eventos.</p>
              </div>
              <button type="button" className="progress-calendar-close" onClick={() => setMostrarCalendario(false)} aria-label="Cerrar calendario">
                <FaTimes aria-hidden="true" />
              </button>
            </header>
            <div className="progress-calendar-body">
              <div className="progress-calendar-main">
                <div className="progress-calendar-monthbar">
                  <h3>
                    {vistaCalendario === "semana"
                      ? `${new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(inicioSemanaCalendario)} – ${new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(inicioSemanaCalendario.getFullYear(), inicioSemanaCalendario.getMonth(), inicioSemanaCalendario.getDate() + 6, 12))}`
                      : new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(mesCalendarioProgreso)}
                  </h3>
                  <div className="progress-calendar-month-actions">
                    <button type="button" aria-label={vistaCalendario === "semana" ? "Semana anterior" : "Mes anterior"} onClick={() => navegarCalendario(-1)}>
                      <FaChevronLeft aria-hidden="true" />
                    </button>
                    <button type="button" className="progress-calendar-today" onClick={() => {
                      const hoy = obtenerFechaLocalHoy();
                      const fechaHoy = new Date(`${hoy}T12:00:00`);
                      setMesCalendarioProgreso(new Date(fechaHoy.getFullYear(), fechaHoy.getMonth(), 1));
                      setFechaCalendario(hoy);
                    }}>Hoy</button>
                    <button type="button" aria-label={vistaCalendario === "semana" ? "Semana siguiente" : "Mes siguiente"} onClick={() => navegarCalendario(1)}>
                      <FaChevronRight aria-hidden="true" />
                    </button>
                  </div>
                  <div className="progress-calendar-view-switch" role="group" aria-label="Vista del calendario">
                    <button type="button" className={vistaCalendario === "mes" ? "active" : ""} aria-pressed={vistaCalendario === "mes"} onClick={() => setVistaCalendario("mes")}>Mes</button>
                    <button type="button" className={vistaCalendario === "semana" ? "active" : ""} aria-pressed={vistaCalendario === "semana"} onClick={() => setVistaCalendario("semana")}>Semana</button>
                  </div>
                </div>
                <div className="progress-calendar-grid">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span className="progress-calendar-weekday" key={d}>{d}</span>)}
                  {diasVisiblesCalendario.map((dia, index) => {
                    if (!dia) {
                      return <span className="progress-calendar-empty" key={`empty-${index}`} />;
                    }
                    const { fecha, dia: numeroDia } = dia;
                    const eventosDia = datos.eventos.filter((evento) => String(evento.fecha || "").slice(0, 10) === fecha);
                    const tareasDia = subtareasCalendario.filter((subtarea) => obtenerFechaObjetivo(subtarea) === fecha);
                    const esHoy = fecha === obtenerFechaLocalHoy();
                    const fechaCompleta = new Intl.DateTimeFormat("es-CO", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(new Date(`${fecha}T12:00:00`));
                    return (
                      <button
                        type="button"
                        key={fecha}
                        className={`progress-calendar-day ${fechaCalendario === fecha ? "selected" : ""} ${esHoy ? "today" : ""} ${eventosDia.length || tareasDia.length ? "has-items" : ""}`}
                        onClick={() => {
                          setFechaCalendario(fecha);
                          const date = new Date(`${fecha}T12:00:00`);
                          setMesCalendarioProgreso(new Date(date.getFullYear(), date.getMonth(), 1));
                        }}
                        aria-pressed={fechaCalendario === fecha}
                        aria-label={`${fechaCompleta}: ${eventosDia.length} eventos y ${tareasDia.length} subtareas`}
                      >
                        <span className="progress-calendar-day-number">{numeroDia}</span>
                        {eventosDia.slice(0, 1).map((evento) => (
                          <span key={evento.id} className="progress-calendar-chip event-chip">
                            <FaCalendarAlt aria-hidden="true" /> {evento.titulo}
                          </span>
                        ))}
                        {tareasDia.slice(0, 1).map((subtarea) => {
                          const estado = estadoEfectivoSubtarea(subtarea);
                          return (
                            <span key={subtarea.id} className={`progress-calendar-chip task-chip ${estado}`}>
                              {estado === "hecho" ? <FaCheckCircle aria-hidden="true" /> : estado === "vencido" ? <FaExclamationTriangle aria-hidden="true" /> : <FaClock aria-hidden="true" />}
                              {subtarea.titulo || subtarea.nombre || "Subtarea"}
                            </span>
                          );
                        })}
                        {eventosDia.length + tareasDia.length > 2 && <small className="progress-calendar-more">+{eventosDia.length + tareasDia.length - 2} más</small>}
                      </button>
                    );
                  })}
                </div>
                <div className="progress-calendar-legend" aria-label="Leyenda de estados">
                  <span className="legend-pending"><FaClock aria-hidden="true" /> Pendiente</span>
                  <span className="legend-progress"><FaClock aria-hidden="true" /> Pospuesta</span>
                  <span className="legend-done"><FaCheckCircle aria-hidden="true" /> Completada</span>
                  <span className="legend-overdue"><FaExclamationTriangle aria-hidden="true" /> Vencida</span>
                  <span className="legend-event"><FaCalendarAlt aria-hidden="true" /> Hito</span>
                </div>
              </div>
              <aside className="progress-calendar-detail">
                <span className="progress-calendar-eyebrow">
                  <FaCalendarAlt aria-hidden="true" /> DÍA SELECCIONADO
                </span>
                <h3>
                  {new Intl.DateTimeFormat("es-CO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(fechaSeleccionadaCalendario)}
                </h3>
                <div className="progress-calendar-hours-summary">
                  <FaClock aria-hidden="true" />
                  <span>
                    <strong>{formatearDuracion(minutosAHoras(minutosEstimadosDia))}</strong>
                    <small>Tiempo estimado · {subtareasDelDiaSeleccionado.length} subtareas</small>
                  </span>
                </div>
                {!eventosDelDiaSeleccionado.length && !subtareasDelDiaSeleccionado.length ? (
                  <div className="progress-calendar-empty-detail">
                    <FaCalendarAlt aria-hidden="true" />
                    <strong>Sin actividades programadas</strong>
                    <p>Selecciona otro día para consultar sus entregas.</p>
                  </div>
                ) : (
                  <div className="progress-calendar-items">
                    {eventosDelDiaSeleccionado.map((evento) => (
                      <article className="progress-calendar-item event-item" key={`evento-${evento.id}`}>
                        <span className="progress-calendar-item-label">
                          <FaCalendarAlt aria-hidden="true" /> HITO · {evento.estado?.etiqueta || "Programado"}
                        </span>
                        <h4>{evento.titulo}</h4>
                        <p>Progreso acumulado: {evento.porcentaje}%</p>
                        <button type="button" onClick={() => navegar(`/eventos/${evento.id}`)}>
                          Ver evento →
                        </button>
                      </article>
                    ))}
                    {subtareasDelDiaSeleccionado.map((subtarea) => {
                      const estado = estadoEfectivoSubtarea(subtarea);
                      const evento = datos.eventos.find(
                        (item) => String(item.id) === String(subtarea.evento_id)
                      );
                      const etiqueta =
                        estado === "hecho"
                          ? "Completada"
                          : estado === "vencido"
                            ? "Vencida"
                            : estado === "pospuesto"
                              ? "Pospuesta"
                              : "Pendiente";
                      return (
                        <article
                          className={`progress-calendar-item task-item task-${estado}`}
                          key={`tarea-${subtarea.id}`}
                        >
                          <span className="progress-calendar-item-label">
                            {estado === "hecho" ? <FaCheckCircle aria-hidden="true" /> : estado === "vencido" ? <FaExclamationTriangle aria-hidden="true" /> : <FaClock aria-hidden="true" />}
                            SUBTAREA · {etiqueta}
                          </span>
                          <h4>{subtarea.titulo || subtarea.nombre || "Subtarea"}</h4>
                          <p>Evento: {evento?.titulo || "Evento no asociado"}</p>
                          <div className="progress-calendar-task-meta">
                            <span>Responsable: {obtenerResponsableSubtarea(subtarea) || "Sin asignar"}</span>
                            <span>Estimado: {formatearDuracion(obtenerHoras(subtarea))}</span>
                          </div>
                          {obtenerNotaSubtarea(subtarea) && (
                            <p>{obtenerNotaSubtarea(subtarea)}</p>
                          )}
                          {evento && (
                            <button type="button" onClick={() => navegar(`/eventos/${evento.id}`)}>
                              Ver evento →
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </aside>
            </div>
            <footer className="progress-calendar-footer">
              <span>Selecciona un día para consultar sus actividades y carga horaria.</span>
              <button type="button" className="btn secondary" onClick={() => setMostrarCalendario(false)}>
                <FaTimes aria-hidden="true" /> Cerrar calendario
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
function OnboardingRegistro() {
  const [seleccionados, setSeleccionados] = useState([
    "fiesta",
    "corporativos",
  ]);

  const opciones = [
    {
      id: "fiesta",
      titulo: "Fiesta",
      etiqueta: "Social",
      descripcion:
        "Bodas, cumpleaños, aniversarios, galas y celebraciones sociales privadas.",
      pie: "Plantillas de banquete",
      icono: "✣",
    },
    {
      id: "corporativos",
      titulo: "Eventos corporativos",
      etiqueta: "B2B",
      descripcion:
        "Lanzamientos de producto, congresos empresariales, reuniones de accionistas y convenciones.",
      pie: "Actas y sponsors",
      icono: "▦",
    },
    {
      id: "personales",
      titulo: "Eventos personales",
      etiqueta: "Íntimo",
      descripcion:
        "Reuniones íntimas, baby showers, cenas exclusivas y compromisos familiares.",
      pie: "Listas RSVP privadas",
      icono: "♡",
    },
    {
      id: "culturales",
      titulo: "Eventos culturales",
      etiqueta: "Público",
      descripcion:
        "Festivales de música, exposiciones de arte, obras de teatro y eventos comunitarios.",
      pie: "Boletaje y aforos",
      icono: "▣",
    },
    {
      id: "tecnologia",
      titulo: "Eventos en tecnología",
      etiqueta: "Tech",
      descripcion:
        "Hackathones, summits tecnológicos, meetups de desarrolladores y lanzamientos de software.",
      pie: "Sprints & Keynotes",
      icono: "▤",
    },
  ];

  const alternarSeleccion = (id) => {
    setSeleccionados((actuales) =>
      actuales.includes(id)
        ? actuales.filter((item) => item !== id)
        : [...actuales, id]
    );
  };

  const comenzarOrganizar = () => {
    navegar("/eventos");
  };

  const omitir = () => {
    navegar("/eventos");
  };

  return (
    <main className="onboarding-page">
      <section className="onboarding-container">

        {/* BRAND */}
        <div className="onboarding-brand">
          <img
            src={logo_EventHub}
            alt="EventHub"
            className="onboarding-logo"
          />
        </div>

        {/* PASO */}
        <div className="onboarding-step">
          <span>☷</span>
          <strong>Paso 2 de 2</strong>
          <span>•</span>
          <span>Personalización de tu espacio de trabajo</span>
        </div>

        {/* TITULO */}
        <div className="onboarding-heading">
          <h1>¿Qué enfoque estás buscando?</h1>

          <small>
            ⓘ Puedes elegir más de uno para adaptar tu panel multifuncional
          </small>
        </div>

        {/* OPCIONES */}
        <div className="onboarding-options">
          {opciones.map((opcion) => {
            const seleccionado = seleccionados.includes(opcion.id);

            return (
              <button
                key={opcion.id}
                type="button"
                className={`onboarding-option ${seleccionado ? "selected" : ""
                  }`}
                onClick={() => alternarSeleccion(opcion.id)}
              >
                <div className="onboarding-option-top">
                  <span className="onboarding-option-icon">
                    {opcion.icono}
                  </span>

                  <span
                    className={`onboarding-check ${seleccionado ? "checked" : ""
                      }`}
                    aria-hidden="true"
                  >
                    {seleccionado ? "✓" : ""}
                  </span>
                </div>

                <div className="onboarding-option-title">
                  <h2>{opcion.titulo}</h2>
                  <span>{opcion.etiqueta}</span>
                </div>

                <p>{opcion.descripcion}</p>

                <div className="onboarding-option-footer">
                  <span>{opcion.pie}</span>
                  <span>→</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ACCIONES */}
        <div className="onboarding-actions">
          <button
            type="button"
            className="onboarding-skip"
            onClick={omitir}
          >
            Omitir por ahora
          </button>

          <button
            type="button"
            className="onboarding-start"
            onClick={comenzarOrganizar}
          >
            Comenzar a Organizar
            <span>→</span>
          </button>
        </div>

        {/* FOOTER */}
        <footer className="onboarding-footer">
          <small>
            © 2025 EventHub Inc. Todos los derechos reservados.
            Tus preferencias se sincronizan en la nube.
          </small>
        </footer>

      </section>
    </main>
  );
}
function RegistroUsuario() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [codigoPais, setCodigoPais] = useState("+57");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");

  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmarPassword, setMostrarConfirmarPassword] =
    useState(false);

  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const categoriasPassword = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const nivelPassword =
    password.length >= 12 && categoriasPassword >= 3
      ? "segura"
      : password.length >= 8 && categoriasPassword >= 2
        ? "media"
        : "debil";
  const etiquetaPassword = {
    debil: "Contraseña no segura",
    media: "Contraseña medianamente segura",
    segura: "Contraseña segura",
  }[nivelPassword];

  const validar = () => {
    const next = {};

    if (!nombre.trim()) {
      next.nombre = "El nombre es requerido.";
    } else if (nombre.trim().length < 2) {
      next.nombre = "El nombre debe tener al menos 2 caracteres.";
    }

    if (!apellido.trim()) {
      next.apellido = "El apellido es requerido.";
    } else if (apellido.trim().length < 2) {
      next.apellido = "El apellido debe tener al menos 2 caracteres.";
    }

    if (!email.trim()) {
      next.email = "El correo electrónico es requerido.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      next.email = "Ingresa un correo electrónico válido.";
    }

    const telefonoLimpio = telefono.replace(/\D/g, "");

    if (!telefonoLimpio) {
      next.telefono = "El teléfono es requerido.";
    } else if (telefonoLimpio.length < 7) {
      next.telefono = "Ingresa un teléfono válido.";
    }

    if (!password) {
      next.password = "La contraseña es requerida.";
    } else if (password.length < 8) {
      next.password = "La contraseña debe tener mínimo 8 caracteres.";
    }

    if (!confirmarPassword) {
      next.confirmarPassword = "Confirma tu contraseña.";
    } else if (password !== confirmarPassword) {
      next.confirmarPassword = "Las contraseñas no coinciden.";
    }

    if (!aceptaTerminos) {
      next.terminos =
        "Debes aceptar los términos y la política de privacidad.";
    }

    return next;
  };

  const limpiarError = (campo) => {
    setErrores((prev) => ({
      ...prev,
      [campo]: "",
    }));

    setErrorServidor("");
  };

  const enviar = async (event) => {
    event.preventDefault();

    const next = validar();

    setErrores(next);
    setErrorServidor("");

    if (Object.keys(next).length > 0) {
      return;
    }

    setEnviando(true);

    try {
      const telefonoCompleto = `${codigoPais} ${telefono
        .replace(/\s+/g, " ")
        .trim()}`;

      const dataRegistro = await registrarUsuario({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        telefono: telefonoCompleto,
        password,
      });

      // Iniciar sesión automáticamente después del registro
      const sesion = await iniciarSesion(
        email.trim(),
        password
      );

      guardarSesion(sesion);

      navegar(
        PERSONALIZACION_HABILITADA ? "/registro/onboarding" : "/eventos"
      );
    } catch (error) {
      setErrorServidor(
        error.message || "No fue posible crear la cuenta."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="register-page">
      <section className="register-card">

        {/* BRAND */}
        <div className="register-brand">
          <img
            src={logo_EventHub}
            alt="EventHub"
            className="register-logo"
          />

          <h1>Crea tu cuenta de organizador</h1>
        </div>

        {/* ERROR SERVIDOR */}
        {errorServidor && (
          <div className="register-error" role="alert">
            <strong>No fue posible crear la cuenta.</strong>
            <span>{errorServidor}</span>
          </div>
        )}

        <form onSubmit={enviar} noValidate>

          {/* NOMBRE / APELLIDO */}
          <div className="register-fields-row">

            <div className="register-field">
              <label htmlFor="register-nombre">
                Nombre <span>*</span>
              </label>

              <input
                id="register-nombre"
                type="text"
                placeholder="Ej. Valentina"
                value={nombre}
                onChange={(event) => {
                  setNombre(event.target.value);
                  limpiarError("nombre");
                }}
                autoComplete="given-name"
                aria-invalid={Boolean(errores.nombre)}
              />

              {errores.nombre && (
                <small className="register-inline-error">
                  {errores.nombre}
                </small>
              )}
            </div>

            <div className="register-field">
              <label htmlFor="register-apellido">
                Apellido <span>*</span>
              </label>

              <input
                id="register-apellido"
                type="text"
                placeholder="Ej. Morales"
                value={apellido}
                onChange={(event) => {
                  setApellido(event.target.value);
                  limpiarError("apellido");
                }}
                autoComplete="family-name"
                aria-invalid={Boolean(errores.apellido)}
              />

              {errores.apellido && (
                <small className="register-inline-error">
                  {errores.apellido}
                </small>
              )}
            </div>

          </div>

          {/* EMAIL */}
          <div className="register-field">
            <label htmlFor="register-email">
              Correo electrónico corporativo <span>*</span>
            </label>

            <div className="register-input-with-icon">
              <span>✉</span>

              <input
                id="register-email"
                type="email"
                placeholder="coordinador@eventhub.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  limpiarError("email");
                }}
                autoComplete="email"
                aria-invalid={Boolean(errores.email)}
              />
            </div>

            {errores.email && (
              <small className="register-inline-error">
                {errores.email}
              </small>
            )}
          </div>

          {/* TELEFONO */}
          <div className="register-field">
            <label htmlFor="register-telefono">
              Teléfono de contacto <span>*</span>
            </label>

            <div className="register-phone">

              <select
                value={codigoPais}
                onChange={(event) => {
                  setCodigoPais(event.target.value);
                  limpiarError("telefono");
                }}
                aria-label="Código de país"
              >
                <option value="+34">+34</option>
                <option value="+57">+57</option>
                <option value="+1">+1</option>
                <option value="+52">+52</option>
              </select>

              <input
                id="register-telefono"
                type="tel"
                placeholder="300 123 4567"
                value={telefono}
                onChange={(event) => {
                  setTelefono(event.target.value);
                  limpiarError("telefono");
                }}
                autoComplete="tel"
                aria-invalid={Boolean(errores.telefono)}
              />

            </div>

            {errores.telefono && (
              <small className="register-inline-error">
                {errores.telefono}
              </small>
            )}
          </div>

          {/* PASSWORD */}
          <div className="register-field">

            <div className="register-label-row">
              <label htmlFor="register-password">
                Contraseña de acceso <span>*</span>
              </label>

              <small>
                Mín. 8 caracteres
              </small>
            </div>

            <div className="register-input-with-icon">

              <span>♙</span>

              <input
                id="register-password"
                type={mostrarPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  limpiarError("password");
                }}
                autoComplete="new-password"
                aria-invalid={Boolean(errores.password)}
              />

              <button
                type="button"
                className="register-password-toggle"
                onClick={() =>
                  setMostrarPassword((prev) => !prev)
                }
                aria-label={
                  mostrarPassword
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"
                }
              >
                {mostrarPassword ? <FaEyeSlash /> : <FaEye />}
              </button>

            </div>

            <div className="register-helper-row">
              <span>{etiquetaPassword}</span>
            </div>
            <div
              className={`password-strength password-strength-${nivelPassword}`}
              role="meter"
              aria-label={etiquetaPassword}
              aria-valuemin="0"
              aria-valuemax="3"
              aria-valuenow={nivelPassword === "debil" ? 1 : nivelPassword === "media" ? 2 : 3}
            >
              <span />
              <span />
              <span />
            </div>

            {errores.password && (
              <small className="register-inline-error">
                {errores.password}
              </small>
            )}
          </div>

          {/* CONFIRMAR PASSWORD */}
          <div className="register-field">

            <label htmlFor="register-confirm-password">
              Confirmar contraseña <span>*</span>
            </label>

            <div className="register-input-with-icon">

              <span>♙</span>

              <input
                id="register-confirm-password"
                type={
                  mostrarConfirmarPassword
                    ? "text"
                    : "password"
                }
                placeholder="••••••••••••"
                value={confirmarPassword}
                onChange={(event) => {
                  setConfirmarPassword(event.target.value);
                  limpiarError("confirmarPassword");
                }}
                autoComplete="new-password"
                aria-invalid={Boolean(errores.confirmarPassword)}
              />

              <button
                type="button"
                className="register-password-toggle"
                onClick={() =>
                  setMostrarConfirmarPassword((prev) => !prev)
                }
                aria-label={
                  mostrarConfirmarPassword
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"
                }
              >
                {mostrarConfirmarPassword ? (
                  <FaEyeSlash />
                ) : (
                  <FaEye />
                )}
              </button>

            </div>

            {errores.confirmarPassword && (
              <small className="register-inline-error">
                {errores.confirmarPassword}
              </small>
            )}
          </div>

          {/* TERMINOS */}
          <div className="register-terms">

            <input
              id="register-terms"
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(event) => {
                setAceptaTerminos(event.target.checked);
                limpiarError("terminos");
              }}
            />

            <label htmlFor="register-terms">
              Acepto los Términos de Servicio y reconozco la Política
              de Privacidad de EventHub, incluyendo el tratamiento de
              registros de producción logística.
            </label>

          </div>

          {errores.terminos && (
            <small className="register-inline-error register-terms-error">
              {errores.terminos}
            </small>
          )}

          {/* CONTINUAR */}
          <button
            type="submit"
            className="register-submit"
            disabled={enviando}
          >
            {enviando
              ? "Creando cuenta..."
              : "Continuar al Onboarding  →"}
          </button>

        </form>

        {/* LOGIN */}
        <div className="register-login-divider">
          <span>¿ya tienes credenciales?</span>
        </div>

        <button
          type="button"
          className="register-login-link"
          onClick={() => navegar("/login")}
        >
          Iniciar Sesión en EventHub&nbsp; →
        </button>

      </section>
    </main>
  );
}
function MobileCreateButton({ ruta, onCrearEvento, onCrearSubtarea }) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef(null);
  const esCreacionGlobalDisponible = ruta === "/hoy" || ruta === "/progreso";

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarFuera = (event) => {
      if (anclaRef.current && !anclaRef.current.contains(event.target)) {
        setAbierto(false);
      }
    };
    const cerrarEscape = (event) => {
      if (event.key === "Escape") {
        setAbierto(false);
        anclaRef.current?.querySelector(".mobile-create-fab")?.focus();
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [abierto]);

  useEffect(() => {
    setAbierto(false);
  }, [ruta]);

  const alternar = () => {
    if (!esCreacionGlobalDisponible) {
      onCrearEvento();
      return;
    }
    setAbierto((visible) => !visible);
  };

  return (
    <div
      className={`mobile-create-anchor${abierto ? " is-open" : ""}`}
      ref={anclaRef}
    >
      <button
        className="mobile-create-fab"
        type="button"
        aria-label={esCreacionGlobalDisponible ? "Abrir opciones de creación" : "Crear evento"}
        title={esCreacionGlobalDisponible ? "Crear" : "Crear evento"}
        aria-haspopup={esCreacionGlobalDisponible ? "menu" : undefined}
        aria-expanded={esCreacionGlobalDisponible ? abierto : undefined}
        aria-controls={esCreacionGlobalDisponible && abierto ? "mobile-create-menu" : undefined}
        onClick={alternar}
      >
        {abierto ? "×" : "+"}
      </button>

      {esCreacionGlobalDisponible && (
        <CreateMenu
          id="mobile-create-menu"
          variant="mobile"
          abierto={abierto}
          onCrearEvento={() => {
            setAbierto(false);
            onCrearEvento();
          }}
          onCrearSubtarea={() => {
            setAbierto(false);
            onCrearSubtarea();
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [modoOscuro, setModoOscuro] = useState(() => {
    try {
      return window.localStorage.getItem("eventhub-theme") === "dark";
    } catch {
      return false;
    }
  });
  const alternarTema = () => setModoOscuro((actual) => !actual);
  useEffect(() => {
    const tema = modoOscuro ? "dark" : "light";
    document.documentElement.dataset.theme = tema;
    document.body.dataset.theme = tema;
    try {
      window.localStorage.setItem("eventhub-theme", tema);
    } catch {
      // La aplicación sigue funcionando aunque el almacenamiento esté bloqueado.
    }
  }, [modoOscuro]);

  const [ruta, setRuta] = useState(obtenerRutaInicial);
  const [eventos, setEventos] = useState([]);
  const [busquedaEventos, setBusquedaEventos] = useState("");
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState("");
  const [toast, setToast] = useState({ type: "success", message: "" });
  const toastTimer = useRef(null);
  const [crearSubtareaAbierta, setCrearSubtareaAbierta] = useState(false);
  const [recargaHoy, setRecargaHoy] = useState(0);

  const cargarEventos = async () => {
    setCargandoEventos(true); setErrorEventos("");
    try { const data = await obtenerEventos(); setEventos(Array.isArray(data) ? data : []); }
    catch (error) { setErrorEventos(error.message); }
    finally { setCargandoEventos(false); }
  };

  useEffect(() => {
    const rutaInicialNavegador = window.location.pathname;

    if (
      estaAutenticado() &&
      (rutaInicialNavegador === "/registro" ||
        rutaInicialNavegador === "/login")
    ) {
      window.history.replaceState({}, "", "/eventos");
    } else if (
      rutaInicialNavegador === "/registro/onboarding" &&
      !PERSONALIZACION_HABILITADA
    ) {
      window.history.replaceState({}, "", "/eventos");
    } else if (
      !estaAutenticado() &&
      esRutaPrivada(rutaInicialNavegador) &&
      rutaInicialNavegador !== "/login"
    ) {
      window.history.replaceState({}, "", "/login");
    }

    const onPop = (event) => {
      const path = window.location.pathname;

      if (
        estaAutenticado() &&
        (path === "/registro" || path === "/registro/onboarding")
      ) {
        window.history.replaceState({}, "", "/eventos");
        setRuta("/eventos");
        return;
      }

      if (
        ruta === "/registro" &&
        !event.state?.eventhubInternalNavigation
      ) {
        window.history.replaceState({}, "", "/login");
        setRuta("/login");
        return;
      }

      if (path === "/registro/onboarding" && !PERSONALIZACION_HABILITADA) {
        window.history.replaceState({}, "", "/eventos");
        setRuta("/eventos");
        return;
      }

      if (esRutaPrivada(path) && !estaAutenticado()) {
        window.history.replaceState({}, "", "/login");
        setRuta("/login");
        return;
      }

      if (path === "/login" && estaAutenticado()) {
        window.history.replaceState({}, "", "/eventos");
        setRuta("/eventos");
        return;
      }

      setRuta(rutaActual());
    };

    window.addEventListener("popstate", onPop);

    if (ruta === "/eventos" && estaAutenticado()) {
      cargarEventos();
    }

    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [ruta]);

  const notify = (message, type = "success") => {
    clearTimeout(toastTimer.current); setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast({ type, message: "" }), 4000);
  };

  const crear = async (evento, subtareas = null) => {
    const lista = Array.isArray(subtareas) ? subtareas : subtareas ? [subtareas] : [];
    const creado = await crearEvento(evento);

    if (lista.length && creado?.id) {
      for (const subtarea of lista) {
        try {
          // Normaliza el responsable opcional antes de enviar la subtarea creada junto al evento.
          const responsableSubtarea = obtenerResponsableSubtarea(subtarea);
          await crearSubtarea({
            ...subtarea,
            responsable: responsableSubtarea || null,
            evento_id: creado.id,
          });
        } catch (error) {
          notify(
            `El evento se creó, pero no fue posible guardar la subtarea: ${error.message}`,
            "error"
          );
          navegar(`/eventos/${creado.id}`);
          return;
        }
      }
    } else if (lista.length) {
      notify("El evento se creó, pero no se recibió su identificador para guardar la subtarea.", "error");
      await cargarEventos();
      navegar("/eventos");
      return;
    }

    notify(lista.length ? "Evento y subtarea creados correctamente" : "Evento creado correctamente");
    if (creado?.id) navegar(`/eventos/${creado.id}`);
    else { await cargarEventos(); navegar("/eventos"); }
  };

  const detalleId = ruta.startsWith("/eventos/") ? ruta.split("/")[2] : null;

  if (ruta === "/login") {
    return (
      <Login
        onLogin={() => {
          navegar("/eventos");
        }}
      />
    );
  }
  if (ruta === "/registro") {
    return <RegistroUsuario />;
  }

  if (ruta === "/registro/onboarding" && PERSONALIZACION_HABILITADA) {
    return <OnboardingRegistro />;
  }

  return <main className={`app${modoOscuro ? " theme-dark" : ""}`}>
    <Header
      ruta={ruta}
      abrirCrear={() => navegar("/crear-evento")}
      abrirCrearSubtarea={() => setCrearSubtareaAbierta(true)}
      busquedaEventos={busquedaEventos}
      onBuscarEventos={setBusquedaEventos}
      modoOscuro={modoOscuro}
      alternarTema={alternarTema}
    />
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
      <button type="button" className={ruta === "/eventos" || ruta.startsWith("/eventos/") ? "mobile-bottom-link active" : "mobile-bottom-link"} onClick={() => navegar("/eventos")}>
        <span aria-hidden="true">✦</span><span>Eventos</span>
      </button>
      <button type="button" className={ruta === "/hoy" ? "mobile-bottom-link active" : "mobile-bottom-link"} onClick={() => navegar("/hoy")}>
        <span aria-hidden="true">◷</span><span>Hoy</span>
      </button>
      <button type="button" className={ruta === "/progreso" ? "mobile-bottom-link active" : "mobile-bottom-link"} onClick={() => navegar("/progreso")}>
        <span aria-hidden="true">▥</span><span>Progreso</span>
      </button>
    </nav>
    <MobileCreateButton
      ruta={ruta}
      onCrearEvento={() => navegar("/crear-evento")}
      onCrearSubtarea={() => setCrearSubtareaAbierta(true)}
    />
    <Toast type={toast.type} message={toast.message} />
    {ruta === "/eventos" && <Eventos eventos={eventos} cargando={cargandoEventos} error={errorEventos} recargar={cargarEventos} crear={() => navegar("/crear-evento")} busqueda={busquedaEventos} />}
    {ruta === "/hoy" && <Today onNotify={notify} recargaToken={recargaHoy} />}
    {/* El widget de ayuda explica el orden y el uso de la vista Hoy, por
        eso solo aparece en esa ruta. */}
    {ruta === "/hoy" && (
      <div className="help-widget">
        <button
          type="button"
          className="help-button"
          aria-label="Ayuda sobre el orden de las gestiones"
          aria-describedby="gestiones-help-tooltip"
        >
          ?
        </button>
        <div
          id="gestiones-help-tooltip"
          className="help-tooltip"
          role="tooltip"
        >
          <strong>¿Cómo se ordena esto?</strong>
          <span>
            Las gestiones se ordenan priorizando primero las más urgentes, luego
            aquellas con mayor prioridad y proximidad, y finalmente las demás
            según su fecha correspondiente.
          </span>
        </div>
      </div>
    )}
    {ruta === "/progreso" && (
      <Progreso
        busquedaEventos={busquedaEventos}
        recargaToken={recargaHoy}
        onLimpiarBusqueda={() => setBusquedaEventos("")}
      />
    )}
    {ruta === "/configuracion" && (<ConfiguracionUsuario onNotify={notify} />)}
    {(ruta === "/hoy" || ruta === "/progreso") && crearSubtareaAbierta && (
      <Modal
        title="Crear subtarea"
        subtitle="Elige el evento y define los detalles de la nueva subtarea."
        close={() => setCrearSubtareaAbierta(false)}
      >
        <CrearSubtareaForm
          permitirCambiarEvento
          onCancelar={() => setCrearSubtareaAbierta(false)}
          onCreada={() => {
            setCrearSubtareaAbierta(false);
            setRecargaHoy((valor) => valor + 1);
            notify("Subtarea creada correctamente");
          }}
        />
      </Modal>
    )}
    {detalleId && <DetalleEvento id={detalleId} volver={() => navegar("/eventos")} onNotify={notify} onEventosChanged={cargarEventos} />}
    {ruta === "/crear-evento" && <CrearEventoPage onCancelar={() => navegar("/eventos")} onCrear={crear} />}
  </main>;

}
