# Etiquetas por NV

Este patch corrige la generación de etiquetas para Portones para que ya no dependa del remito.

## Portones

El endpoint de etiquetas consulta directamente:

```sql
[WebApp].[dbo].[Pre_Produccion]
```

por el campo `NV`.

Campos usados en la etiqueta:

- `NV`
- `PARTIDA`
- `Nombre`
- `Direccion`
- `RazSoc`
- `Sistema`
- `Ancho`
- `Alto`
- `Revestimiento`
- `Lucera`
- `Color`
- `Liston`
- `Color_Sistema`
- `Color_Hoja`
- `PUERTA_Posicion`
- `MOTOR_Condicion`
- `MOTOR_Posicion`
- `Estado`

La fecha impresa en la etiqueta es la fecha actual, es decir, la fecha en que se genera/imprime la etiqueta.

Endpoint principal:

```txt
/api/etiquetas/portones/by-nv?nv=4005&empresa=portones
```

También funciona el endpoint genérico:

```txt
/api/etiquetas/by-nv?nv=4005&empresa=portones
```

## Ipanels

Se mantiene la lógica anterior para Ipanels, con el logo de Ipanels incluido en:

```txt
server/src/assets/ipanel.png
```

Endpoint:

```txt
/api/etiquetas/ipanel/by-nv?nv=100414&empresa=ipanel
```

## Archivos incluidos

- `server/src/labelRoutes.js`: reemplazar este archivo completo.
- `server/src/labelPdf.js`: generador PDF de etiquetas.
- `server/src/index.js`: monta rutas de etiquetas si aún no estaban montadas.
- `server/src/assets/ipanel.png`: logo Ipanels para PDF.
- `client/src/api.js`: helpers del frontend para abrir etiquetas.

No se incluye `client/src/App.jsx` porque la app que ya tenés desplegada ya muestra el botón `Etiqueta`.
