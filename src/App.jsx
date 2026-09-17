import { useState } from "react";
import "./App.css";

const initialTasks = [
  { id: 1, name: "Reservar salón", status: "Hecho", due: "02 Nov", hours: "2h", note: "Salón campestre confirmado." },
  { id: 2, name: "Enviar invitaciones", status: "Hecho", due: "03 Nov", hours: "1h", note: "Invitaciones enviadas a 120 invitados." },
  { id: 3, name: "Confirmar catering", status: "Pendiente", due: "Hoy", hours: "2h", urgent: true, note: "Vence hoy: decisión de menú para evitar penalizaciones contractuales." },
  { id: 4, name: "Búsqueda de proveedores", status: "Pospuesto", due: "05 Nov", hours: "5h", note: "Pendiente comparar tres cotizaciones." },
];
const icons = { Hecho: "✓", Pendiente: "○", Pospuesto: "↻" };

function Badge({ status }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <b>{icons[status]}</b>{status}
    </span>
  );
}

function Modal({ title, close, children }) {
  return (
    <div className="overlay">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="close" aria-label="Cerrar" onClick={close}>×</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("eventos");
  const [tasks, setTasks] = useState(initialTasks);
  const [active, setActive] = useState(initialTasks[2]);
  const [modal, setModal] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("Evento creado correctamente");
  const done = tasks.filter((t) => t.status === "Hecho").length;

  const notify = (text) => { setToast(text); setTimeout(() => setToast(""), 3200); };
  const save = (status) => {
    setTasks((all) => all.map((t) => t.id === active.id ? { ...t, status, note: note || t.note } : t));
    setActive({ ...active, status, note: note || active.note });
    setNote(""); setModal("");
    notify(status === "Hecho" ? "Gestión marcada como hecha" : "Gestión pospuesta correctamente");
  };

  return (
    <main className="app">
      <header>
        <a className="brand" href="#inicio"><i>EH</i>EventHub</a>
        <nav aria-label="Navegación principal">
          <button className={view === "eventos" ? "selected" : ""} onClick={() => setView("eventos")}>Eventos</button>
          <button className={view === "hoy" ? "selected" : ""} onClick={() => setView("hoy")}>Hoy</button>
        </nav>
        <button className="btn primary" onClick={() => notify("Evento creado correctamente")}>+ Crear evento</button>
      </header>

      {toast && <div className="toast" role="status">✓ {toast}</div>}

      {view === "eventos" ? (
        <section className="page">
          <div className="heading">
            <div>
              <small>TU PLANIFICACIÓN</small>
              <h1>Eventos y plan de trabajo</h1>
              <p>Organiza cada detalle y avanza con claridad.</p>
            </div>
            <button className="btn ghost" onClick={() => setModal("edit")}>Editar evento</button>
          </div>

          <article className="event">
            <div className="event-icon">✦</div>
            <div>
              <small>PRÓXIMO EVENTO</small>
              <h2>Boda Campestre Elena &amp; Marcos</h2>
              <p>▣ 18 Nov 2025 <span>◷ Límite de gestión: <b>4 horas/día</b></span></p>
            </div>
            <button className="delete" aria-label="Eliminar evento" onClick={() => notify("El evento se envió a la papelera")}>⌫</button>
          </article>

          <section className="card progress">
            <div>
              <h2>Progreso del plan</h2>
              <p>{done} de 4 tareas completadas ({4 - done} pendientes)</p>
            </div>
            <strong>{done * 25}%</strong>
            <div className="track"><span style={{ width: `${done * 25}%` }} /></div>
          </section>

          <section className="card tasks">
            <div className="section-head">
              <div>
                <h2>Plan de trabajo logístico</h2>
                <p>Define y da seguimiento a cada gestión.</p>
              </div>
              <button className="btn secondary" onClick={() => setModal("new")}>+ Agregar tarea</button>
            </div>
            {tasks.map((task) => (
              <article className="task" key={task.id}>
                <i className={`check ${task.status.toLowerCase()}`}>{icons[task.status]}</i>
                <div className="task-name">
                  <b>{task.name}</b>
                  <p>{task.note}</p>
                </div>
                <div className="detail"><span>Plazo</span><b>{task.due}</b></div>
                <div className="detail"><span>Estimado</span><b>{task.hours}</b></div>
                <Badge status={task.status} />
                <button className="dots" aria-label={`Registrar ${task.name}`} onClick={() => { setActive(task); setModal("execute"); }}>⋯</button>
                {task.id === 4 && <button className="reprogram" onClick={() => setModal("reschedule")}>Reprogramar</button>}
              </article>
            ))}
          </section>
        </section>
      ) : (
        <Today tasks={tasks} active={active} setActive={setActive} open={() => setModal("execute")} />
      )}

      {modal === "execute" && (
        <Modal title="Registrar ejecución" close={() => setModal("")}>
          <p>Actualiza el estado de <b>{active.name}</b>.</p>
          <label htmlFor="note">Nota opcional</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escribe un detalle para el historial..." />
          <div className="actions">
            <button className="btn ghost" onClick={() => save("Pospuesto")}>↻ Posponer</button>
            <button className="btn primary" onClick={() => save("Hecho")}>✓ Marcar como hecho</button>
          </div>
        </Modal>
      )}

      {modal === "edit" && (
        <Modal title="Editar evento" close={() => setModal("")}>
          <label>Nombre del evento</label>
          <input defaultValue="Boda Campestre Elena & Marcos" />
          <label>Límite diario de gestión</label>
          <input defaultValue="4 horas/día" />
          <div className="actions">
            <button className="btn primary" onClick={() => { setModal(""); notify("Cambios del evento guardados"); }}>Guardar cambios</button>
          </div>
        </Modal>
      )}

      {modal === "new" && (
        <Modal title="Agregar tarea" close={() => setModal("")}>
          <p>La nueva gestión se añadirá al plan logístico.</p>
          <label>Nombre de la tarea</label>
          <input placeholder="Ej. Coordinar decoración" />
          <div className="actions">
            <button className="btn ghost" onClick={() => setModal("")}>Cancelar</button>
            <button className="btn primary" onClick={() => { setModal(""); notify("Tarea agregada al plan"); }}>Agregar tarea</button>
          </div>
        </Modal>
      )}

      {modal === "reschedule" && (
        <Modal title="Reprogramar tarea" close={() => setModal("")}>
          <small>REPROGRAMAR TAREA</small>
          <h3>Búsqueda de proveedores</h3>
          <p>Esta tarea requiere <b>5 horas estimadas</b>.</p>
          <label>Nueva fecha</label>
          <select defaultValue="05">
            <option value="05">05 de Noviembre</option>
            <option value="07">07 de Noviembre</option>
          </select>
          <div className="conflict">
            <h3>⚠ Hay un conflicto de tiempo</h3>
            <p>Las tareas programadas para este día superan el límite diario definido.</p>
            <b>8h programadas · 4h límite diario</b>
            <em>+4h de sobrecarga · 200% de ocupación</em>
            <div><span /><i /></div>
          </div>
          <div className="suggestion">
            ✓ <span><b>Fecha sugerida: 07 de Noviembre</b><br />0h ocupadas de 4h disponibles</span>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setModal("")}>Cancelar</button>
            <button className="btn primary" onClick={() => { setModal(""); notify("Tarea reprogramada para el 07 de noviembre"); }}>Comprobar nueva fecha</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Today({ tasks, active, setActive, open }) {
  const groups = [
    ["Gestiones urgentes", "Atención inmediata", tasks.filter((t) => t.urgent && t.status !== "Hecho")],
    ["Otras gestiones pendientes", "Programadas para hoy", tasks.filter((t) => !t.urgent && t.status === "Pendiente")],
    ["Gestiones realizadas hoy", "Historial del día", tasks.filter((t) => t.status === "Hecho")],
  ];
  return (
    <section className="page">
      <div className="heading">
        <div>
          <small>18 DE NOVIEMBRE</small>
          <h1>Hoy</h1>
          <p>Prioriza lo importante y conserva el ritmo.</p>
        </div>
        <div className="capacity">
          Capacidad diaria <b>3h <small>/ 4h</small></b>
          <span />
        </div>
      </div>
      <div className="today">
        <div>
          {groups.map(([title, subtitle, group]) => (
            <section className="card group" key={title}>
              <h2>{title}</h2>
              <p>{subtitle}</p>
              {group.length ? group.map((task) => (
                <button className={`today-task ${task.urgent ? "urgent" : ""}`} key={task.id} onClick={() => setActive(task)}>
                  <span>
                    <b>{task.name}</b>
                    {task.urgent && <em>⚠ Urgente</em>}
                    <small>{task.note}</small>
                  </span>
                  <b>{task.hours}</b>
                </button>
              )) : <p>No hay gestiones en esta sección.</p>}
            </section>
          ))}
        </div>
        <aside className="card panel">
          <small>GESTIÓN SELECCIONADA</small>
          <h2>{active.name}</h2>
          <p>◷ {active.hours} estimadas &nbsp; ▣ {active.due}</p>
          <blockquote>{active.note}</blockquote>
          <button className="btn primary" onClick={open}>Registrar ejecución</button>
          <small>Puedes marcarla como hecha o posponerla con una nota opcional.</small>
        </aside>
      </div>
    </section>
  );
}