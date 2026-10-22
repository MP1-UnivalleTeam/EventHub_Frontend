# EventHub Frontend

SPA (Single Page Application) desarrollada con **React 19** y **Vite** para consultar, crear y gestionar eventos y subtareas. Se comunica con el backend de EventHub (repositorio separado) a través de una API REST.

Este frontend está desplegado en **Vercel**.

---

## 📋 Tabla de contenidos

- [Sobre el proyecto](#sobre-el-proyecto)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos previos](#requisitos-previos)
- [Instalación local](#instalación-local)
- [Variables de entorno](#variables-de-entorno)
- [Ejecutar en desarrollo](#ejecutar-en-desarrollo)
- [Rutas principales](#rutas-principales)
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Relación con el backend](#relación-con-el-backend)
- [Contribución](#contribución)
- [Licencia](#licencia)

---

## Sobre el proyecto

EventHub Frontend permite a un organizador:

- Iniciar sesión y registrarse.
- Ver la lista de eventos y crear nuevos.
- Ver el detalle de un evento y gestionar sus subtareas.
- Consultar la vista "Hoy" con gestiones agrupadas por urgencia.
- Revisar el progreso de cada evento y ordenar por fecha.
- Configurar el límite de horas de trabajo por día.

Todas las peticiones requieren autenticación (excepto registro y login) y se envían al backend mediante el cliente HTTP definido en `src/services/api.js`.

---

## Stack tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|-----------|
| Framework | React | ^19.2.8 | Interfaz de usuario |
| Build tool | Vite | ^8.3.0 | Servidor de desarrollo y bundler |
| Iconos | react-icons | ^5.7.0 | Iconografía |
| Linter | oxlint | ^1.81.0 | Análisis estático de JavaScript |
| Tipos | @types/react | ^19.2.18 | Definiciones de TypeScript (solo tipos) |

---

## Estructura del repositorio

```text
EventHub_Frontend/
├── index.html              # Punto de entrada HTML
├── vite.config.js          # Configuración de Vite
├── vercel.json             # Despliegue en Vercel (rewrites SPA)
├── package.json            # Dependencias y scripts
├── .env.example            # Ejemplo de variables de entorno
├── .gitignore              # Archivos ignorados por Git
├── README.md               # Este archivo
├── README_FRONTEND_API.md  # Contrato compartido con el backend
├── public/                 # Archivos estáticos públicos
└── src/
    ├── main.jsx            # Punto de entrada de React (StrictMode)
    ├── index.css           # Estilos base y fuentes
    ├── App.jsx             # Componente principal (navegación, componentes y lógica)
    ├── App.css             # Todos los estilos de la aplicación
    └── services/
        ├── api.js          # Cliente HTTP al backend
        └── auth.js         # Gestión de sesión y autenticación
```

---

## Requisitos previos

- Node.js 18 o superior.
- `npm` (incluido con Node.js).
- El backend de EventHub corriendo (local o en Render) para consumir la API.

---

## Instalación local

1. Clona este repositorio:

```bash
git clone https://github.com/MP1-UnivalleTeam/EventHub_Frontend.git
cd EventHub_Frontend
```

2. Instala las dependencias:

```bash
npm install
```

3. Copia el archivo de ejemplo de variables de entorno:

```bash
# Windows (PowerShell):
Copy-Item .env.example .env

# macOS / Linux:
cp .env.example .env
```

4. Edita `.env` y define la URL del backend:

```env
VITE_API_URL=https://tu-backend.onrender.com
```

5. Ejecuta en modo desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173` (o el puerto que indique Vite).

> En Windows PowerShell, si `npm` da errores de directiva de ejecución, usa `npm.cmd` en lugar de `npm` (por ejemplo: `npm.cmd run build`).

---

## Variables de entorno

Crea un archivo `.env` en la raíz del frontend. **No subas este archivo a Git.**

```env
VITE_API_URL=https://eventhub-backend-tbst.onrender.com
```

La variable `VITE_API_URL` debe apuntar a la URL pública del backend de EventHub.

---

## Rutas principales

| Ruta | Descripción |
|------|-------------|
| `/` | Redirige a `/eventos` |
| `/login` | Inicio de sesión |
| `/registro` | Registro de nuevo organizador |
| `/registro/onboarding` | Onboarding posterior al registro |
| `/eventos` | Listado de eventos y creación |
| `/eventos/:id` | Detalle de un evento con sus subtareas |
| `/hoy` | Gestiones del día (vencidas, urgentes, próximas) |
| `/progreso` | Progreso de eventos con filtros y ordenamiento |
| `/crear-evento` | Formulario para crear un evento |
| `/configuracion` | Límite de horas por día del organizador |

---

## Despliegue en Vercel

El archivo `vercel.json` está configurado para aplicaciones de una sola página (SPA):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Esto permite que el router del frontend maneje las rutas internas sin que Vercel devuelva 404 al refrescar.

Conecta este repositorio a Vercel y configura la variable de entorno `VITE_API_URL` en los ajustes del proyecto.

---

## Relación con el backend

Este frontend depende del backend de EventHub, que vive en un **repositorio separado**:

- Repositorio backend: `https://github.com/MP1-UnivalleTeam/EventHub_Backend.git` (FastAPI + Supabase, desplegado en Render).
- Contrato de API: los endpoints y payloads están documentados en `README_FRONTEND_API.md` (dentro de este repositorio).

Cada repositorio es independiente: clona, configura y despliega cada uno por separado.

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo con Vite |
| `npm run build` | Genera la versión de producción en `dist/` |
| `npm run lint` | Ejecuta el linter (oxlint) |
| `npm run preview` | Vista previa de la build de producción |

---

## Contribución

1. Crea una rama desde `main` o `master`.
2. Realiza tus cambios y ejecuta `npm run lint` para verificar el código.
3. Abre un Pull Request describiendo el cambio y cómo se probó.

---

## Licencia

No definido.
