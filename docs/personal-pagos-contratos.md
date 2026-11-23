# Personal, pagos y contratos — Colombia

Este módulo administra expedientes, conceptos revisados, soportes de pagos y evidencias de aceptación. No liquida automáticamente toda la nómina ni certifica el cumplimiento integral del empleador. No reemplaza la asesoría laboral, contable ni el documento soporte de nómina electrónica DIAN.

## Uso por la empresa

1. El administrador con módulo Financiero entra a **Personal y pagos**. Solo ve los registros de su empresa y sede; cajeros, distribuidores y gerentes no tienen acceso al expediente.
2. En **Privacidad**, registra responsable, contacto y aviso revisado: finalidades, canales de consulta/corrección, acceso, conservación y entrega de copias. Cada invitación conserva la versión presentada al trabajador.
3. Registra empleados sin crearles usuarios de caja. Usa su correo personal controlado por ellos, identifica el cargo, fecha real de ingreso, salario pactado y frecuencia de pago. Retirar a una persona conserva su historial. Las correcciones de identificación requieren intervención documentada del responsable; no se reasignan identidades históricas.
4. Crea el periodo con los devengados y deducciones determinados por el responsable de nómina. Cada deducción exige fundamento y soporte PDF; cargar un soporte no determina por sí mismo su legalidad. Se bloquean periodos superpuestos. Deben revisarse salario mínimo y auxilios aplicables, jornada/recargos, novedades, seguridad social, prestaciones y retenciones; no se calculan por este módulo.
5. Registra la fecha e importe realmente pagados. Puede haber abonos, con saldo visible; las transferencias requieren soporte. Cada pago genera exactamente un egreso NOMINA dentro de la misma transacción. Un doble envío con la misma clave no duplica el egreso. Registrar no transfiere dinero ni confirma que el trabajador lo recibió.
6. Envía el documento al empleado. El enlace dura siete días, el código diez minutos, con cinco intentos y máximo diez envíos por enlace separados por un minuto. Solo el correo del trabajador recibe el código. Después de verificarlo, la sesión dura treinta minutos.
7. El trabajador descarga el documento exacto, lee el aviso y decide: confirmar únicamente el abono recibido, aceptar el contrato o presentar una diferencia. Una reclamación no marca recepción ni aceptación. No hay renuncia a derechos. La firma y el registro usan fecha real del servidor; la fecha histórica de pago o inicio nunca cambia la fecha de firma.
8. Se envía una copia al canal expresamente autorizado y se permite descargar el original, constancia y evidencias. Si falla el correo después de firmar, la firma se conserva, la entrega queda pendiente y el administrador puede reenviarla. Revisa **Historial**. La aceptación del servidor SMTP no prueba lectura del destinatario.

La alternativa en papel es obligatoria cuando el trabajador no puede o no desea usar el mecanismo electrónico. El empleador debe entregar y conservar esos originales mediante su procedimiento documental; esta versión no presenta una carga administrativa de un documento como si el trabajador hubiera firmado electrónicamente.

## Contratos

En **Contratos → Crear contrato en el sistema** el administrador redacta el documento: domicilios de ambas partes, lugares de celebración, contratación y servicio, cargo y funciones, remuneración y periodicidad, componente en especie, jornada, descansos, modalidad, duración y terminación. El salario básico total incluye el componente en especie y el PDF distingue el importe en dinero. Se bloquea el exceso del límite general del 50 % en especie; el límite especial del salario mínimo y la remuneración mínima aplicable deben revisarse con el asesor (artículo 129). Los datos se basan en el artículo 39 del Código Sustantivo del Trabajo; completarlos no acredita por sí solo la legalidad de lo pactado.

Puede guardar modelos propios de cláusulas y anexos de texto. Las variables admitidas se sustituyen con los datos de la empresa y del empleado, sin ejecutar código ni HTML. Los modelos se conservan como registros nuevos; aplicarlos copia el texto al borrador y no modifica contratos anteriores. Los anexos de texto se incorporan al mismo PDF; para anexos externos escaneados, utiliza la carga externa del PDF completo.

El flujo es **borrador → revisión jurídica de esa versión → emisión del original → firma del empleador → firma del trabajador**. Guardar cambios conserva la versión anterior e invalida la revisión. Otro empleado exige un nuevo borrador. Si cambian los datos de las partes después de la revisión, se bloquea la emisión hasta guardar y revisar nuevamente. La emisión concurrente devuelve el mismo contrato y conserva exactamente los bytes revisados del original. El borrador no se presenta como firmado y las fechas reales de elaboración/firma se distinguen del inicio pactado.

Se mantiene la carga de plantillas y contratos externos en PDF. **El sistema no comprueba que el asesor realmente haya revisado el texto ni reemplaza su criterio jurídico.**

El representante autorizado lee el original y confirma su contraseña actual, identidad y facultad. Solo después se permite la invitación al empleado. El original se conserva con SHA-256, firmado mediante evidencias separadas; no se modifica el PDF tras la aceptación. La firma no es una firma digital certificada ni usa biometría. La verificación de correo demuestra control del buzón en ese momento; el empleador debe identificar al trabajador y garantizar que nadie más controla ese correo.

Se admite indefinido, término fijo y obra/labor. Se exige fecha final para fijo y descripción precisa para obra/labor. La validación de fijo considera el máximo de cuatro años usando los contratos fijos registrados del trabajador; no inicia el cómputo antes del 25 de junio de 2025, fecha de entrada en vigor de la Ley 2466. No decide si un reingreso constituye una relación nueva ni calcula todas las prórrogas o preavisos; debe revisarlo el asesor. Cargar documentos hoy no subsana retroactivamente omisiones de contratos escritos ni períodos de prueba. No se permite editar o borrar originales/pagos firmados desde la interfaz; los errores requieren un procedimiento documentado de ajuste que conserve la evidencia y revisión de su efecto contable.

Fuente adicional del editor: [Código Sustantivo del Trabajo, artículos 39 y 129](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=199983).

## Requisitos jurídicos utilizados

| Referencia oficial | Controles y límites |
| --- | --- |
| [Decreto 526 de 2021](https://jurinfo.jep.gov.co/Normograma/Compilacion/docs/decreto_0526_2021.htm) | Identificación previa a cargo del empleador, aprobación expresa, documento íntegro, evidencia verificable, entrega de copia por canal autorizado, gratuidad para el trabajador, fechas reales y alternativa en papel. La suficiencia probatoria depende del procedimiento completo del empleador. |
| [Ley 2466 de 2025](https://jurinfo.jep.gov.co/normograma/compilacion/docs/ley_2466_2025.htm) | Revisión de modalidades, términos escritos, obra/labor precisa y límite del término fijo. El sistema no certifica cláusulas ni determina por sí solo la modalidad legal correcta. |
| [Ley 1581 de 2012](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm) | Acceso restringido, aviso versionado, canal de atención, expedientes cifrados, datos mínimos y ausencia de biometría. El empleador define la base jurídica de cada tratamiento y atiende los derechos del titular. |
| [DIAN: documento soporte de nómina electrónica](https://www.dian.gov.co/impuestos/Paginas/Sistema-de-Factura-Electronica/Documento-Soporte-de-Pago-de-Nomina-Electronica.aspx) | Estado NO_CONECTADA / NO_TRANSMITIDO. El soporte interno no es validación DIAN. La obligación fiscal y los plazos aplicables los determina el contador. Sin proveedor ni integración no se transmite, no hay CUNE ni resultado de validación inventado. |

Revisión normativa de implementación: noviembre de 2026. El empleador debe validar su caso concreto y actualizaciones posteriores.

## Operación segura y despliegue

- Configurar `PERSONAL_ENCRYPTION_KEY` con 32 bytes aleatorios en hexadecimal (64 caracteres), independiente de JWT y de claves de respaldo. Sin ella el módulo rechaza almacenar expedientes; los otros módulos siguen funcionando.
- Generar la clave mediante un gestor seguro y conservar una copia fuera del servidor con acceso limitado. **No cambiarla ni borrarla después de almacenar expedientes:** esta versión no implementa rotación de claves. Perderla impide recuperar los datos incluso si se restaura la base.
- Configurar SMTP institucional (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, opcional `SMTP_FROM`) con transporte seguro. No hay códigos de emergencia visibles para administradores. Probar entrega y recepción con participantes autorizados antes de usarlo con personal real.
- `PERSONAL_WEB_URL` es opcional; por defecto `https://app.powerpospioneers.com`. Solo se admiten subdominios HTTPS del dominio del producto.
- La tabla `personal_registros` se crea de forma aditiva al primer acceso autenticado en la sede, después de validar la clave; no ejecuta `db push` ni altera tablas operativas en producción. El modelo se incorpora a ambos esquemas Prisma para instalaciones nuevas. Respaldos y herramientas de aislamiento reconocen sedes donde la tabla aún no existe.
- JSON y PDFs privados se cifran AES-256-GCM, ligados a empresa/sede/tipo/UUID/versión. No están en `uploads` ni en el catálogo público. Los archivos están limitados a PDF de 5 MB. Mantener límites de recursos, TLS y controles del servidor; revisar PDFs de origen antes de cargarlos.
- Enlaces y sesiones son aleatorios, se almacenan sus huellas cifradas y no aparecen en parámetros HTTP. El enlace utiliza fragmento, sin referer; no se debe compartir. Una vez verificado, permite únicamente el documento de esa invitación.
- Los egresos con origen `personal-pago:` son inmutables desde Financiero, incluso si todavía no han sido confirmados. Nunca se debe corregir evidencia con SQL improvisado.
- Conservar los respaldos cifrados por sede junto con el código/esquema de esa versión y respaldar la clave privada por separado. Ensayar restauración antes del primer uso real. Los respaldos antiguos requieren la versión de esquema con la cual se generaron.
- Esta versión no elimina automáticamente expedientes: la retención, bloqueo por reclamación y eliminación al vencimiento deben definirse y ejecutarse por un procedimiento autorizado, atendiendo las obligaciones laborales, contables, tributarias y de datos personales. No existe un plazo universal que permita borrar todos los soportes.
- La vista administrativa presenta hasta 500 registros recientes por sección; las verificaciones de solapamientos y saldos consultan todo el historial vinculado. Se conserva la evidencia de cada documento y sus copias descargables.

## Validación

`npm test -- --runInBand personal.reglas.spec.ts` verifica cifrado autenticado, aislamiento criptográfico, integridad, clave dedicada, fechas/importes y fundamentos de deducciones.

`node test/personal-integracion.cjs` exige `POS_TEST_DATABASE_URL` de la base efímera local de CI; rechaza cualquier destino ajeno. Prueba autenticación real, separación entre empresas, pagos concurrentes/idempotentes y límite de saldo, egresos protegidos, OTP con bloqueo y consumo único, copias y revisión/firma de contratos. Su correo se sustituye por un doble de prueba; no se envían correos reales. Se ejecuta en PostgreSQL y MariaDB.
