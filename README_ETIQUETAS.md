# Cambios: etiquetas de portones por NV

Este parche agrega una salida de etiquetas para impresora Brother usando el mismo servidor de Remitos.

## Backend

Nuevo endpoint:

```http
GET /api/etiquetas/portones/by-nv?nv=100414
```

Devuelve un PDF listo para imprimir, con una página por cada fila encontrada en SQL Server para esa NV.

La información se busca en:

- `WebApp.dbo.Pre_Produccion` por `NV`
- `dbo.NTASVTAS` / `Portones.dbo.NTASVTAS` para datos de cliente, dirección y fecha
- `dbo.REMITOS` + `dbo.IREMITOS` para indicar remitos encontrados o pendientes

## Frontend

En modo `NV`, se agrega el botón `Etiqueta` junto a `Buscar`.
El usuario ingresa la NV y abre el PDF de etiquetas en una pestaña nueva.

## Archivos incluidos

- `server/src/labelPdf.js`
- `server/src/labelRoutes.js`
- `server/src/index.js`
- `client/src/api.js`
- `client/src/App.jsx`

## Nota

El archivo `.lbx` enviado se usó como referencia de medidas y distribución. Este parche genera PDF imprimible para Brother QL-800, no un `.lbx` editable de P-touch Editor.
