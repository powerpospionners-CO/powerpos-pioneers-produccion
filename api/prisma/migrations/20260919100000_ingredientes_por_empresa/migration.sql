ALTER TABLE "ingredientes" ADD COLUMN "empresaId" INTEGER;

DO $$
DECLARE
  conflict_count INTEGER;
  orphan_count INTEGER;
  only_company INTEGER;
BEGIN
  WITH owners AS (
    SELECT pi."ingredienteId" AS id, p."empresaId" FROM "producto_ingredientes" pi JOIN "productos" p ON p.id = pi."productoId"
    UNION
    SELECT pr."ingredienteId", p."empresaId" FROM "preparacion_ingredientes" pr JOIN "preparaciones" p ON p.id = pr."preparacionId"
    UNION
    SELECT a."ingredienteId", a."empresaId" FROM "adicionales" a WHERE a."ingredienteId" IS NOT NULL
    UNION
    SELECT li."ingredienteId", l."empresaId" FROM "lote_preparacion_ingredientes" li JOIN "lotes_preparacion" l ON l.id = li."loteId"
    UNION
    SELECT mi."ingredienteId", u."empresaId" FROM "movimientos_inventario" mi JOIN "usuarios" u ON u.id = mi."usuarioId" WHERE u."empresaId" IS NOT NULL
  )
  SELECT COUNT(*) INTO conflict_count FROM (SELECT id FROM owners GROUP BY id HAVING COUNT(DISTINCT "empresaId") > 1) conflicts;
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Hay ingredientes compartidos entre empresas. Sepárelos antes de migrar.';
  END IF;

  WITH owners AS (
    SELECT pi."ingredienteId" AS id, p."empresaId" FROM "producto_ingredientes" pi JOIN "productos" p ON p.id = pi."productoId"
    UNION
    SELECT pr."ingredienteId", p."empresaId" FROM "preparacion_ingredientes" pr JOIN "preparaciones" p ON p.id = pr."preparacionId"
    UNION
    SELECT a."ingredienteId", a."empresaId" FROM "adicionales" a WHERE a."ingredienteId" IS NOT NULL
    UNION
    SELECT li."ingredienteId", l."empresaId" FROM "lote_preparacion_ingredientes" li JOIN "lotes_preparacion" l ON l.id = li."loteId"
    UNION
    SELECT mi."ingredienteId", u."empresaId" FROM "movimientos_inventario" mi JOIN "usuarios" u ON u.id = mi."usuarioId" WHERE u."empresaId" IS NOT NULL
  )
  UPDATE "ingredientes" i SET "empresaId" = o."empresaId" FROM owners o WHERE i.id = o.id;

  SELECT COUNT(*) INTO orphan_count FROM "ingredientes" WHERE "empresaId" IS NULL;
  IF orphan_count > 0 THEN
    IF (SELECT COUNT(*) FROM "empresas") <> 1 THEN
      RAISE EXCEPTION 'Hay ingredientes sin empresa identificable. Asígnelos antes de migrar.';
    END IF;
    SELECT id INTO only_company FROM "empresas" LIMIT 1;
    UPDATE "ingredientes" SET "empresaId" = only_company WHERE "empresaId" IS NULL;
  END IF;
END $$;

ALTER TABLE "ingredientes" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "ingredientes" ADD CONSTRAINT "ingredientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ingredientes_empresaId_activo_idx" ON "ingredientes"("empresaId", "activo");
