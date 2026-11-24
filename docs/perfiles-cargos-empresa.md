# Perfiles de contrato por cargo y empresa

Cada empresa y sede administra sus propios nombres de cargo, funciones y condiciones. No existe una lista cerrada de cargos ni se asignan los de Enchila Market a otras empresas. Las sugerencias al registrar empleados se obtienen exclusivamente de los empleados y perfiles de la empresa y sede autenticadas.

En **Personal → Contratos → Configurar plantillas por cargo**, el administrador puede crear un nombre libre, usar el cargo del empleado seleccionado o editar un perfil propio. Cada cargo conserva sus tres modalidades (indefinido, fijo y obra o labor), funciones, jornada, descansos y lugar. Guardar una versión busca la anterior por cargo y modalidad; no reemplaza perfiles de otros cargos. Las versiones anteriores y los contratos ya emitidos se conservan.

Los ejemplos de caja, ventas externas y producción de totopos y tortillas son guías de redacción optativas y editables, no cargos precreados. No asignan horarios, salarios ni comisiones. Al iniciar un perfil distinto se limpian funciones, jornada, descansos y lugar; no se copian las condiciones de una cajera a ventas o producción. Pueden reutilizarse los datos generales del empleador y la forma de pago, sujetos a revisión.

Al seleccionar al empleado, el sistema busca el perfil cuya denominación coincide con su cargo, ignorando mayúsculas, acentos y espacios repetidos. No acepta por el flujo automático una plantilla de otro cargo. Si no hay perfil, solicita crearlo. Las plantillas históricas sin cargo siguen disponibles, pero requieren selección y confirmación expresas de sus funciones, jornada, descansos y lugar; no se usan silenciosamente como respaldo.

Se conserva el salario y periodicidad del expediente. Las funciones o el lugar particulares del empleado prevalecen cuando están registrados. El resumen muestra las condiciones antes de generar el borrador. Se revalida el perfil contra el expediente actual al guardar automáticamente. La revisión jurídica, emisión y firma digital mantienen sus controles existentes.

La guía de producción menciona capacitación, higiene, trazabilidad y uso seguro de equipos; no sustituye los procedimientos de manipulación de alimentos ni la evaluación de riesgos de la empresa. La guía comercial no concede por sí misma facultades para descontar, otorgar crédito o recaudar. Si se acuerdan comisiones deben documentarse sus condiciones específicas, sin inferirlas del cargo.

Pruebas: normalización de nombres; rechazo de perfiles distintos; revisión expresa de plantillas antiguas; conservación de cargos coexistentes; aislamiento entre empresas con el mismo nombre de cargo y condiciones diferentes. La integración existente sigue generando y firmando las tres modalidades con datos ficticios en PostgreSQL y MariaDB.
