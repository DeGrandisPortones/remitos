# Patch etiquetas: popup editable y medidas en milimetros

Copiar estos archivos sobre el repo `remitos` y redeployar backend y frontend.

## Cambios

- El boton `Etiqueta` ya no abre el PDF directo.
- Primero consulta los datos de etiqueta por NV.
- Muestra un popup editable con los campos que se van a imprimir.
- El usuario puede corregir los datos y luego presionar `Generar etiqueta`.
- El PDF se genera con los valores editados.
- En Portones, las medidas se calculan como milimetros:
  - `Ancho = 2.7000` imprime `2700`
  - `Alto = 2.2000` imprime `2200`
  - La etiqueta muestra `MEDIDAS: 2700 X 2200 MM`
- Si algun dia el valor ya viene en milimetros, por ejemplo `2700`, no se multiplica nuevamente.

## Nuevos endpoints

- `GET /api/etiquetas/by-nv/data?nv=4017&empresa=portones`
  - Devuelve los datos de etiqueta para mostrar en el popup.

- `POST /api/etiquetas/pdf`
  - Recibe `{ labels, nv, empresa }` y genera el PDF con los valores editados.

## Archivos incluidos

- `server/src/labelRoutes.js`
- `client/src/api.js`
- `client/src/App.jsx`
- `client/src/styles.css`


## Ajuste accionamiento

Cuando `MOTOR_Condicion` es `MANUAL`, la etiqueta imprime `MANUAL` completo. Cuando es `AUTOMATICO`, imprime `AUT`. En ambos casos se concatena con `MOTOR_Posicion`.
