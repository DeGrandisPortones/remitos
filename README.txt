Cambios incluidos:
- client/src/App.jsx
- client/src/api.js
- client/src/styles.css

Que hace:
- Al abrir la app, dispara en segundo plano una consulta a NV 4000 sobre portones para despertar el servidor.
- No muestra la respuesta de esa consulta de warm-up.
- Muestra un visor de estado del servidor Portones: Conectando / Online / Offline.
- Refresca el estado cada 60 segundos.

Reemplazar estos archivos en el repo remitos y volver a compilar el cliente.
