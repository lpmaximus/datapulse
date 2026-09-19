// Dados de exemplo para testar os relatórios e gerar PDFs de amostra.
export const NOW = new Date("2026-09-19T15:00:00Z");
const d = (s) => new Date(s + "T00:00:00Z");

const task = (over = {}) => ({
  id: "t?",
  name: "Tarefa",
  kind: "TASK",
  type: null,
  criticality: "MEDIUM",
  status: "IN_PROGRESS",
  progress: 40,
  parentId: null,
  assigneeName: "Ana Souza",
  startDate: d("2026-08-01"),
  plannedDate: d("2026-10-15"),
  forecastDate: null,
  actualDate: null,
  dri: 30,
  ...over,
});

const rev = (over = {}) => ({
  id: "r?",
  documentId: "d1",
  documentNumber: "PE-ELE-001",
  documentName: "Diagrama unifilar",
  disciplineTag: "ELE",
  name: "R00",
  sequence: 0,
  status: "IN_REVIEW",
  packageId: "p1",
  packageName: "Emissao R00 - Eletrica",
  specialistName: "Carlos Lima",
  analysisTag: null,
  analysisName: null,
  issuedAt: d("2026-08-20"),
  dueAt: d("2026-09-10"),
  analyzedAt: null,
  inReviewSince: d("2026-08-25"),
  ...over,
});

export const projectA = {
  id: "pa",
  name: "Subestacao Norte - Expansao",
  osNumber: "OS-2041",
  status: "ACTIVE",
  clientName: "Mineradora Alfa",
  sectorName: "Mineracao",
  designFirmName: "Projetos Beta Ltda",
  managerName: "Luiz Paulo Cruz",
  currency: "BRL",
  driScores: [
    { score: 72.4, calculatedAt: d("2026-09-19") },
    { score: 68.0, calculatedAt: d("2026-09-18") },
    { score: 55.5, calculatedAt: d("2026-09-12") },
    { score: 40.0, calculatedAt: d("2026-09-05") },
  ],
  tasks: [
    task({ id: "m1", name: "Marco 1 - Projeto basico", kind: "MILESTONE", plannedDate: d("2026-09-10"), forecastDate: d("2026-09-30"), dri: 60, progress: 50 }),
    task({ id: "p1", name: "Emissao R00 - Eletrica", type: "Pacote de revisão", parentId: "m1", status: "IN_REVIEW", plannedDate: d("2026-09-05"), forecastDate: d("2026-09-25"), dri: 72.4, progress: 20, assigneeName: "Carlos Lima" }),
    task({ id: "p2", name: "Emissao R00 - Civil", type: "Pacote de revisão", parentId: "m1", status: "DONE", plannedDate: d("2026-09-01"), actualDate: d("2026-09-02"), dri: 0, progress: 100 }),
    task({ id: "t3", name: "Levantamento de campo", parentId: "m1", status: "BLOCKED", plannedDate: d("2026-09-08"), dri: 55 }),
    task({ id: "t4", name: "Licenciamento", plannedDate: d("2026-12-01"), status: "NOT_STARTED", progress: 0, dri: 15 }),
    task({ id: "t5", name: "Tarefa cancelada", status: "CANCELLED" }),
  ],
  impediments: [
    { id: "i1", taskId: "t3", taskName: "Levantamento de campo", description: "Acesso a area energizada negado pela operacao", ownerName: "Ana Souza", waitingOn: "Cliente - Operacao", createdAt: d("2026-09-01") },
  ],
  requests: [
    { id: "q1", taskName: "Emissao R00 - Eletrica", type: "Documento de referência", description: "Estudo de curto-circuito atualizado", ownerName: "Ana Souza", waitingOn: "Cliente", status: "PENDING", dueAt: d("2026-09-10"), createdAt: d("2026-08-28") },
    { id: "q2", taskName: null, type: null, description: "Planta de locacao", ownerName: null, waitingOn: null, status: "ANSWERED", dueAt: null, createdAt: d("2026-08-01") },
  ],
  revisions: [
    rev({ id: "r1" }),
    rev({ id: "r2", documentId: "d2", documentNumber: "PE-ELE-002", documentName: "Lista de cabos", status: "COMMENTED", analysisTag: "C", analysisName: "Comentado", analyzedAt: d("2026-09-08"), inReviewSince: null }),
    rev({ id: "r3", documentId: "d3", documentNumber: "PE-CIV-001", documentName: "Fundacoes", disciplineTag: "CIV", status: "APPROVED", packageId: "p2", packageName: "Emissao R00 - Civil", analysisTag: "A", analysisName: "Aprovado", analyzedAt: d("2026-09-02"), inReviewSince: null }),
    rev({ id: "r4", packageId: "p3", packageName: "Emissao R01 - Eletrica", documentId: "d2", documentNumber: "PE-ELE-002", documentName: "Lista de cabos", name: "R01", sequence: 1, status: "DRAFT", inReviewSince: null }),
  ],
};

export const projectB = {
  ...projectA,
  id: "pb",
  name: "Galpao Logistico",
  osNumber: null,
  clientName: null,
  driScores: [{ score: 20, calculatedAt: d("2026-09-19") }, { score: 25, calculatedAt: d("2026-09-12") }],
  tasks: [task({ id: "x1", name: "Fundacao", plannedDate: d("2026-11-01"), dri: 20 })],
  impediments: [],
  requests: [],
  revisions: [],
};

export const projectC = { ...projectA, id: "pc", name: "Sem DRI ainda", status: "PAUSED", driScores: [], tasks: [], impediments: [], requests: [], revisions: [] };

export const packageInput = {
  projectName: projectA.name,
  projectOsNumber: "OS-2041",
  clientName: "Mineradora Alfa",
  designFirmName: "Projetos Beta Ltda",
  id: "p1",
  name: "Emissao R00 - Eletrica",
  parentName: "Marco 1 - Projeto basico",
  status: "IN_REVIEW",
  progress: 20,
  assigneeName: "Carlos Lima",
  plannedDate: d("2026-09-05"),
  forecastDate: d("2026-09-25"),
  actualDate: null,
  revisions: projectA.revisions.filter((r) => r.packageId === "p1"),
  transitions: [
    { id: "x1", revisionName: "R00", documentNumber: "PE-ELE-001", documentName: "Diagrama unifilar", action: "CREATED", actorName: "Ana Souza", assignedToName: null, analysisTag: null, comment: null, daysInPreviousStage: null, createdAt: d("2026-08-20") },
    { id: "x2", revisionName: "R00", documentNumber: "PE-ELE-001", documentName: "Diagrama unifilar", action: "SUBMITTED", actorName: "Ana Souza", assignedToName: "Carlos Lima", analysisTag: null, comment: "Enviado para analise", daysInPreviousStage: 5, createdAt: d("2026-08-25") },
    { id: "x3", revisionName: "R00", documentNumber: "PE-ELE-002", documentName: "Lista de cabos", action: "COMMENTED", actorName: "Carlos Lima", assignedToName: null, analysisTag: "C", comment: "Revisar bitolas do circuito 4", daysInPreviousStage: 14, createdAt: d("2026-09-08") },
  ],
  impediments: [],
  requests: [projectA.requests[0]],
  deadlineChanges: [{ fromDate: d("2026-09-05"), toDate: d("2026-09-25"), reason: "Aguardando estudo de curto-circuito", createdAt: d("2026-09-09") }],
};
