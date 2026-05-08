# Cambios: etiquetas por NV para Portones e Ipanels

Este parche agrega una salida de etiquetas para impresora Brother usando el mismo servidor de Remitos.

## Backend

Nuevo endpoint genérico:

```http
GET /api/etiquetas/by-nv?nv=100414&empresa=portones
GET /api/etiquetas/by-nv?nv=100414&empresa=ipanel
```

También quedan disponibles estos aliases:

```http
GET /api/etiquetas/portones/by-nv?nv=100414
GET /api/etiquetas/ipanel/by-nv?nv=100414
```

Devuelve un PDF listo para imprimir, con una página por cada etiqueta encontrada para esa NV.

## Portones

La información se busca en:

- `WebApp.dbo.Pre_Produccion` por `NV`
- `dbo.NTASVTAS` / `Portones.dbo.NTASVTAS` para datos de cliente, dirección y fecha
- `dbo.REMITOS` + `dbo.IREMITOS` para indicar remitos encontrados o pendientes

## Ipanels

La información se busca en la base `Paneles`:

- `dbo.NTASVTAS` por `numero = NV`, tomando el campo `remito`
- `dbo.REMITOS` por número de remito para cliente, dirección, localidad, vendedor y fecha
- `dbo.IREMITOS` con `PRODUCTOS` / `ARTICULOS` para generar una etiqueta por ítem

La etiqueta de Ipanels usa el logo enviado, incluido en:

```text
server/src/assets/ipanel.png
```

## Frontend

En modo `NV`, se agrega el botón `Etiqueta` junto a `Buscar`.
El usuario elige empresa desde los logos existentes, ingresa la NV y abre el PDF de etiquetas en una pestaña nueva.

## Archivos incluidos

- `server/src/assets/ipanel.png`
- `server/src/labelPdf.js`
- `server/src/labelRoutes.js`
- `server/src/index.js`
- `client/src/api.js`
- `client/src/App.jsx`

## Nota

El archivo `.lbx` enviado se usó como referencia de medidas y distribución. Este parche genera PDF imprimible para Brother QL-800, no un `.lbx` editable de P-touch Editor.

## Fallback para NV antiguas

Si una NV de Portones no tiene fila en `Pre_Produccion`, pero sí tiene factura/remito, el endpoint ya no devuelve error. En ese caso genera las etiquetas usando:

- `NTASVTAS.factura`
- `IREMITOS.facnro`
- `REMITOS`
- ítems de `IREMITOS` con descripción desde `PRODUCTOS` / `ARTICULOS` cuando exista

Esto cubre casos como NV viejas donde `Buscar` encuentra el remito, pero no existe información completa de portón en `Pre_Produccion`.
