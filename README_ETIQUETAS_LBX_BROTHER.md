# Patch etiquetas Brother LBX

Este patch agrega una salida LBX para Portones usando la plantilla original de P-touch Editor.

## Motivo

El error de Brother indica que la impresora tiene cargado rollo 2.4 pulgadas / 62 mm continuo, pero el trabajo enviado por la aplicacion llega como 1.1 x 3.5 pulgadas. Eso suele pasar al imprimir PDFs desde Chrome/Windows porque el driver selecciona otro tamaño de papel.

## Cambio aplicado

En el popup de edicion de etiquetas se agrega el boton:

- Descargar LBX Brother

Ese archivo `.lbx` conserva la configuracion de la plantilla original:

- Brother QL-800
- ancho 62 mm
- cinta continua
- layout de P-touch Editor

Flujo recomendado:

1. Ingresar NV.
2. Click en Etiqueta.
3. Revisar/editar los datos en el popup.
4. Click en Descargar LBX Brother.
5. Abrir el `.lbx` con P-touch Editor e imprimir.

El PDF se mantiene como alternativa, pero para la QL-800 conviene usar LBX.

## Endpoints nuevos

- POST `/api/etiquetas/lbx`

Body:

```json
{
  "empresa": "portones",
  "nv": "4017",
  "labels": [
    {
      "brand": "portones",
      "orderCode": "N° 4017",
      "colorPiernas": "BLANCO",
      "revestimiento": "BLANCO",
      "liston": "NO",
      "puerta": "DERECHA",
      "lucera": "NO",
      "accionamiento": "MANUAL DERECHA",
      "tarea": "PARA REVESTIR",
      "direccion": "...",
      "direccion2": "...",
      "cliente": "...",
      "fecha": "2026-05-08",
      "comercializa": "...",
      "medidas": "2700 X 2200 mm"
    }
  ]
}
```

## Etiqueta chica

Se agrega una etiqueta chica para Portones con el formato:

- Logo De Grandis
- `N° <NV>`
- `REF: <Nombre> / <RazSoc>`

Desde el popup de edición se puede usar el botón `LBX chico x4`. El archivo LBX generado trae 4 etiquetas chicas iguales sobre cinta continua de 62 mm, con líneas de corte internas para la Brother. Los datos usados salen de los valores editados en el popup, por lo que cualquier corrección manual también impacta en la etiqueta chica.

Endpoint usado por el front:

```txt
POST /api/etiquetas/small/lbx
```

Body:

```json
{
  "nv": 4165,
  "empresa": "portones",
  "copies": 4,
  "labels": [
    {
      "brand": "portones",
      "nv": 4165,
      "cliente": "Nombre",
      "comercializa": "RazSoc"
    }
  ]
}
```
