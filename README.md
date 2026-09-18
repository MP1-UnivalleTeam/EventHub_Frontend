# EventHub Frontend

SPA en React/Vite para consultar y crear eventos. La URL del backend se configura con `VITE_API_URL`; consulta [`.env.example`](.env.example).

## Rutas

- `/eventos`: lista remota y creación de eventos.
- `/hoy`: prototipo de la vista de gestión diaria.

`vercel.json` permite recargar esas rutas sin que Vercel responda 404.

## Desarrollo

```bash
npm install
npm run dev
```

