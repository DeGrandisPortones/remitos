# Etiquetas Brother - Remitos

## Cambio principal

Para Portones, el endpoint de etiquetas ahora conecta directamente a la base `WebApp` y consulta:

```sql
SELECT TOP (1000) ...
FROM dbo.Pre_Produccion
WHERE NV = @nv
```

También deja fallbacks con comparación como texto y consulta cross database `[WebApp].[dbo].[Pre_Produccion]` para cubrir ambos escenarios.

Esto corrige el caso donde la NV existe en `WebApp.dbo.Pre_Produccion`, pero no se encontraba porque el pool anterior estaba conectado a `Portones`.

## Endpoint

```txt
GET /api/etiquetas/portones/by-nv?nv=4017&empresa=portones
GET /api/etiquetas/by-nv?nv=4017&empresa=portones
```

## Datos usados para Portones

- NV
- PARTIDA
- Nombre
- Direccion
- RazSoc
- Sistema
- Ancho
- Alto
- Revestimiento
- Lucera
- Color
- Liston
- Color_Sistema
- Color_Hoja
- Estado

La fecha impresa es la fecha actual de generación.

## Ipanels

Ipanels mantiene la lógica anterior usando `Paneles`, remito e ítems, con el logo `server/src/assets/ipanel.png`.

## Archivos incluidos

Copiar estos archivos sobre el proyecto:

- `server/src/labelRoutes.js`
- `server/src/labelPdf.js`
- `server/src/index.js`
- `server/src/assets/ipanel.png`
- `client/src/api.js`

Después redeployar backend y frontend.


## Mapeo Portones actualizado

La etiqueta de Portones toma los datos desde `WebApp.dbo.Pre_Produccion` por columna `NV`.

- Número principal: `N° <NV>`
- COLOR PIERNAS: `Color_Sistema`
- REVESTIMIENTO: `Color_Hoja`
- LISTON: `Liston`
- LUCERA: `Lucera`
- ACCIONAMIENTO: `MOTOR_Condicion` abreviado (`AUTOMATICO` -> `AUT`, `MANUAL` -> `MAN`) + `MOTOR_Posicion`
- Bloque central: `Tipo_Embalaje`
- DIRECCION y segunda línea: `Direccion`
- CLIENTE: `Nombre`
- FECHA: fecha de generación del archivo
- COMERCIALIZA: `RazSoc`
- MEDIDAS: `Ancho X Alto`

Si una propiedad requerida viene `NULL`, vacía o como texto `NULL`, se imprime `NO`.
