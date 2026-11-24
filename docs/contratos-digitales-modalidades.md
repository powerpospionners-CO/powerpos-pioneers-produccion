# Contratos digitales por modalidad

En **Personal y pagos → Contratos → Contratos digitales por modalidad**, el administrador guarda una vez las condiciones habituales de la empresa y sede: razón social legal, domicilio, lugares de contratación y servicio, forma y fechas de pago, jornada, descansos y funciones habituales. La operación guarda de forma atómica las tres plantillas: indefinido, fijo y obra o labor. Cada actualización conserva la versión anterior.

Las bases incorporan cláusulas sobre servicio, remuneración y auxilios, jornada y recargos, seguridad social y prestaciones, seguridad y salud, caja sin descuentos automáticos, privacidad, continuidad y firma electrónica. Cada modalidad incorpora su regulación de duración y terminación. No se insertan períodos de prueba retroactivos ni acuerdos de renuncia a derechos. Son bases editables para revisión, no asesoría ni certificación de cumplimiento.

## Empleados y autollenado

El expediente conserva nombre, identificación, correo, cargo, ingreso real, salario básico y periodicidad. Ahora también admite domicilio, funciones específicas y lugar de servicio. Los nuevos campos son opcionales al registrar al empleado para mantener compatibilidad; el domicilio es necesario para generar automáticamente un contrato completo. Si no hay funciones específicas, se usan las de la plantilla. No se copia información de otra empresa o sede.

Seleccionar empleado y modalidad muestra el correo de destino y las condiciones tomadas de su expediente. El servidor lee el expediente y la plantilla; no utiliza un nombre o salario enviados por el cliente para el autollenado. El término fijo requiere fecha final y valida el plazo de cuatro años; las prórrogas se vuelven a comprobar al emitir. Obra o labor exige descripción precisa y condición de terminación. El flujo automático no convierte una relación ya iniciada a fijo u obra: esos casos se revisan individualmente en el editor y no deben presentarse como documentos firmados retroactivamente.

Completar genera un borrador editable con identidad y condiciones reales. Se mantienen la lectura del PDF, revisión jurídica de la versión, invalidación de revisión ante cambios, huellas de los expedientes y emisión idempotente del original. El contrato conserva el identificador de la plantilla usada.

## Firma y envío

Después de emitir, **Firmar como empleador** muestra el nombre y correo del trabajador. **Firmar y enviar enlace** confirma la contraseña del administrador, representación y aceptación del original. Registra la firma del empleador y solicita el envío al correo del expediente mediante el SMTP privado ya configurado.

Si el envío falla, la firma no se borra: la respuesta lo indica expresamente y el contrato queda pendiente del empleado. **Enviar al empleado** permite reintentar sin una nueva firma del empleador. Nunca se afirma que el correo se entregó cuando falla el proveedor. Si se pierde la respuesta de red, debe recargarse el estado antes de reintentar.

El empleado recibe el enlace opaco, verifica su propio correo mediante OTP, descarga y lee el PDF y acepta desde su acceso. Se conserva evidencia vinculada a la huella del original y se entrega copia. Una invitación, la creación del borrador o la revisión no equivalen a su firma. Se mantiene la alternativa en papel.

## Validación

Las pruebas unitarias verifican las tres modalidades, condiciones y fechas específicas, rechazo de empleados retirados o datos incompletos y uso de los datos del expediente. La integración de Personal en PostgreSQL y MariaDB genera, revisa, emite y firma las tres modalidades con usuarios y correos ficticios, verifica aislamiento y permisos, simula un fallo de SMTP, reenvía y completa la firma OTP. No envía correos reales ni modifica contratos de producción.
