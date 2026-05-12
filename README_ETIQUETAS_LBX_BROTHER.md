# Patch etiquetas Brother LBX only

Este patch deja la generación de etiquetas únicamente en formato `.lbx` para Brother P-touch Editor.

## Cambio aplicado

Se quitan las opciones de PDF de etiquetas. En el popup de edición quedan solamente:

- `LBX grande`
- `LBX chico x4`

El flujo queda:

1. Ingresar NV.
2. Click en `Etiqueta`.
3. Revisar/editar los datos en el popup.
4. Descargar `LBX grande` o `LBX chico x4`.
5. Abrir el `.lbx` con P-touch Editor e imprimir.

## Endpoints activos para etiquetas

- `GET /api/etiquetas/by-nv/data?nv=4017&empresa=portones`
- `POST /api/etiquetas/lbx`
- `POST /api/etiquetas/small/lbx`

## Endpoints quitados para etiquetas

Ya no se usa ni se expone desde la UI:

- `POST /api/etiquetas/pdf`
- `POST /api/etiquetas/small/pdf`
- `GET /api/etiquetas/by-nv`
- `GET /api/etiquetas/portones/by-nv`
- `GET /api/etiquetas/ipanel/by-nv`

## Etiqueta grande

Usa los valores editados en el popup y genera un `.lbx` compatible con Brother QL-800, cinta continua de 62 mm.

## Etiqueta chica

Genera un `.lbx` con 4 etiquetas chicas iguales.

Formato:

```txt
N° <NV>
REF: <Nombre> / <RazSoc>
```

También usa los valores editados en el popup.

## Nota al aplicar

Este ZIP no necesita `server/src/labelPdf.js` para etiquetas. Si ese archivo quedó de un patch anterior, se puede dejar sin uso o eliminarlo manualmente.


## LBX completo

Se agrega el boton **LBT completo** en el popup de edicion. Genera un unico archivo `.lbx` con:

- 1 etiqueta grande.
- 4 etiquetas chicas iguales debajo.

El archivo usa la misma plantilla Brother de 62 mm continua y define cortes entre la etiqueta grande y cada etiqueta chica.


## Cambio: Fecha de venta

La etiqueta grande imprime `FECHA DE VENTA` arriba de `DIRECCION`, tomando `Fecha`, `fecha` o `Fecha_NV` desde `WebApp.dbo.Pre_Produccion` y mostrando el valor en formato `DD-MM-AAAA`.

## Ajuste fecha de venta

La fecha de venta que se imprime arriba de Direccion en la etiqueta grande se obtiene desde `Portones.dbo.NTASVTAS.fecha`, buscando por la NV en `numero` y, como fallback, en `idpedido`.

El formato de salida en la etiqueta es `DD-MM-AAAA`.
