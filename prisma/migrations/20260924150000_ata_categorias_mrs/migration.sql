-- AlterTable: subtítulo opcional do item da ata (ex.: "Visão Geral")
ALTER TABLE "MeetingTopic" ADD COLUMN "title" TEXT;

-- Categorias da ata passam a seguir as seções da MRS (Assuntos Gerais,
-- Planejamento, Engenharia, Outros). As disciplinas antigas viram
-- Assuntos Gerais.
UPDATE "MeetingTopic"
SET "category" = 'ASSUNTOS GERAIS'
WHERE UPPER(TRIM("category")) IN ('SEGURANÇA', 'SEGURANCA', 'MEIO AMBIENTE', 'QUALIDADE');
