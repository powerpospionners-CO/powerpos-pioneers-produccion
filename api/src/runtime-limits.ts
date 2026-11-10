// Hostings compartidos limitan los hilos del usuario. El motor Rust puede
// agotar ese límite antes de abrir MySQL y devolver P1001 o un panic del timer.
// Aplicar antes de construir Prisma; un servidor dedicado puede configurar
// valores distintos explícitamente en sus variables de entorno.
process.env.TOKIO_WORKER_THREADS ??= '1';
process.env.RAYON_NUM_THREADS ??= '1';

export {};
