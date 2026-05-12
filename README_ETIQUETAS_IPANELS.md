# Etiquetas IPANELS

Este patch agrega generacion de etiqueta grande LBX para IPANELS.

## Origen de datos

- Base: `Paneles`
- Cabecera: `dbo.NTASVTAS`, buscando por `numero = NV`.
- Producto: `dbo.INTASVTAS.producto`, buscando por `numero = NV`.
- Descripcion del producto: `dbo.PRODUCTOS.descripcion`, uniendo `PRODUCTOS.codigo = INTASVTAS.producto`.

## Campos usados

- Logo: IPANELS
- NV: `NTASVTAS.numero`
- Producto: `PRODUCTOS.descripcion`
- Cliente / distribuidor: `NTASVTAS.nombre`
- Direccion: `NTASVTAS.dirent` o `NTASVTAS.direccion`
- Localidad: `NTASVTAS.localidad` + `NTASVTAS.provincia`
- Fecha: `NTASVTAS.fecha`
- Vendedor / comercializa: `NTASVTAS.vendedor`

## UI

Para IPANELS solo se muestra el boton `LBX grande`.
Para Portones se mantienen `LBT completo`, `LBX grande` y `LBX chico x4`.


## Ajuste observaciones

En la etiqueta grande de Ipanels, el bloque inferior ahora imprime `OBSERVACIONES` usando `Paneles.dbo.NTASVTAS.observ`. Ya no imprime vendedor/comercializa en ese sector.
