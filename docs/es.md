# Radio France

## Presentación

Esta integración muestra en Gladys lo que suena en antena en las emisoras de **Radio France**: France Inter, franceinfo, France Culture, France Musique, FIP, Mouv’, las emisoras locales **ICI** (antes France Bleu) y las radios web. Para cada emisora que siga, tendrá el programa, la sección en curso (el informativo, una columna) y la canción, y sus escenas pueden reaccionar cuando empieza un nuevo programa, una nueva sección o una nueva canción.

Los datos vienen de la **Open API** oficial de Radio France, con su propia clave de API. La integración **no es oficial ni está vinculada a Radio France**. No reproduce ningún flujo: la Open API no puede usarse para escuchar en directo.

### Condiciones de uso

Usar la Open API supone aceptar sus condiciones: una clave personal, un uso privado y no comercial, datos mostrados tal cual y nunca almacenados, y el crédito **«données fournies par l’Open API Radio France»** (datos proporcionados por la Open API de Radio France), que muestra cada widget de la integración. La integración solo guarda los datos en memoria, una hora como mucho; `/data` solo contiene su contador de solicitudes y sus interruptores de seguimiento. No se usa ningún logotipo de Radio France.

## Requisitos previos

- Gladys Assistant 5.3.0 o posterior.
- Una **clave de la Open API** gratuita y personal: cada usuario de Gladys solicita la suya.
- Acceso a Internet desde Gladys (las solicitudes van a `openapi.radiofrance.fr`).

### Obtener su clave de la Open API

1. Cree una cuenta en [developers.radiofrance.fr](https://developers.radiofrance.fr).
2. En **Mi cuenta**, haga clic en **Solicitar una clave de API**.
3. Indique el nombre de su proyecto (por ejemplo «Gladys en casa») y su finalidad (por ejemplo «mostrar lo que suena en antena en mi panel domótico»).
4. Radio France revisa cada solicitud a mano y envía la clave por correo, a menudo el mismo día.
5. Pegue la clave en la configuración de la integración, guarde y pulse **Probar la clave de API**.

## Configuración

| Campo                            | Por defecto | Función                                                                                                                               |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Clave de la Open API             | —           | Su clave. Se envía a Radio France en una cabecera de cada solicitud; nunca se vuelve a mostrar ni se escribe en los registros.        |
| Idioma de los textos             | Francés     | Nombres de las funciones, mensajes de estado y frases de las acciones de escena. Los títulos de Radio France nunca se traducen.       |
| Presupuesto diario (solicitudes) | 900         | Solicitudes que la integración se permite al día, de las 1.000 de la clave (100 a 1.000). Redúzcalo si la clave se usa en otro sitio. |
| Intervalo mínimo (segundos)      | 90          | Nunca dos lecturas más seguidas que esto (60 a 600). El presupuesto puede espaciarlas más.                                            |

**Probar la clave de API** lee la lista de emisoras (una solicitud), actualiza la pestaña Descubrir y muestra las solicitudes usadas hoy.

## Uso

### Dispositivos

Abra la pestaña **Descubrir** de la integración y añada las emisoras que desee. La lista viene de la API, con los nombres que Radio France les da.

| Función     | Notas                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programa    | El programa en antena (su nombre). Un guion si no hay ninguno: FIP y sus radios web emiten sobre todo música sin programas.                                      |
| Sección     | La sección dentro del programa: el informativo, una columna, una entrevista. Un guion entre dos secciones.                                                       |
| Canción     | «Artista – Título» de la canción en antena, en las emisoras musicales. Un guion en otro caso.                                                                    |
| Seguimiento | Activado por defecto. **Solo se consultan las emisoras seguidas.** Desactívelo para las emisoras que no escucha, o deje que una escena lo active cuando escuche. |

### Cuota y lecturas

Una clave permite **1.000 solicitudes al día**; por encima, Radio France la bloquea hasta el día siguiente. La integración cuenta cada solicitud que envía y consulta hasta **10 emisoras en una sola solicitud**. Espera al final del programa, la sección o la canción en curso antes de volver a preguntar (nunca antes del intervalo mínimo, al menos cada 15 minutos) y reparte las solicitudes en el resto del día cuando el presupuesto escasea. Si no se sigue nada, no envía ninguna solicitud. Se supone que el contador vuelve a cero a **medianoche, hora de París** (Radio France no lo indica).

Las acciones de escena, el botón **Actualizar** y el widget «Próximos programas» usan el mismo presupuesto. Cuando se agota, lo indican y esperan a medianoche.

### Widgets del panel

![Los widgets de la integración: en antena en una emisora hablada y en una emisora musical, los próximos programas, el uso de la Open API (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-radio-france/main/docs/assets/widgets.es.png)

- **En antena**: el programa, el episodio, la sección, la canción, el final del programa y la hora de la última lectura, con un botón **Actualizar** (una solicitud, como mucho una vez por minuto).
- **Próximos programas**: los próximos programas de una emisora, según su parrilla (leída como mucho cada 15 minutos). FIP y sus radios web no publican su programación con antelación.
- **Uso de la Open API**: las solicitudes de hoy frente al presupuesto, el estado (correcto, pausa por cuota, clave rechazada…), la próxima lectura, las emisoras seguidas.

Elija la emisora en los ajustes de un widget (por defecto, la primera emisora seguida). La imagen de arriba es una ilustración generada con programas inventados, no una captura de pantalla.

### Escenas

Disparadores, para las emisoras seguidas (detectados por las lecturas periódicas, así que hasta unos minutos después del inicio; nunca en la primera lectura tras un reinicio):

- **Radio France: nueva canción** — título, artista, álbum, año, sello discográfico.
- **Radio France: empieza un programa** — programa, título del episodio, resumen, página web, hora de fin.
- **Radio France: empieza una sección** — las mismas variables, para el informativo, una columna, una entrevista.

Acciones:

- **Radio France: qué suena en antena** — programa, sección, canción, artista, álbum y final del programa, para una notificación o un mensaje de voz.
- **Radio France: próximos programas** — los próximos programas en las próximas 12 horas, con una frase para leer («Próximamente en France Inter: …»).

Ejemplos: cuando empiece el informativo de las 7 en France Inter, subir el volumen de la radio de la cocina; cuando suene una nueva canción en FIP, mostrarla en la tele; cada tarde a las 19:00, que Gladys lea los programas de la noche de France Culture.

## Solución de problemas

- **«Radio France rechaza la clave de API»**: compruebe la clave (sin espacios antes ni después). Una clave nueva puede tardar unos minutos en funcionar. La integración vuelve a intentarlo a los 5 minutos y luego cada vez con menos frecuencia (hasta una hora).
- **«Cuota diaria alcanzada» o «Presupuesto diario agotado»**: todo espera a medianoche (hora de París). Siga menos emisoras, aumente el intervalo mínimo o compruebe que la clave no la usa otro programa.
- **«La Open API no responde»**: el servicio o su acceso a Internet falla; la integración vuelve a intentarlo un poco más tarde. Un «error de servidor» también puede significar que la cuota de la clave se consume en otro sitio.
- **Una emisora nunca se actualiza**: compruebe que su interruptor **Seguimiento** está activado y mire el widget «Uso de la Open API». Una emisora que Radio France ha retirado de su lista ya no se consulta.
- **FIP no tiene programa**: es normal, FIP y sus radios web emiten sobre todo música sin programas.
- Para un problema, indique las versiones de Gladys y de la integración, el mensaje de **Probar la clave de API** (nunca muestra la clave) y los registros con `DEBUG=gladys-integration-sdk`.
