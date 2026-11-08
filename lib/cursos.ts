export type Nivel = "inicial" | "intermedio" | "avanzado";

export interface Curso {
  id: string;
  titulo: string;
  nivel: Nivel;
  horas: number;
  descripcion: string;
}

export const cursos: Curso[] = [
  {
    id: "git-flujo",
    titulo: "Git y flujos de trabajo en equipo",
    nivel: "inicial",
    horas: 12,
    descripcion: "Branches, pull requests, revisiones de código y resolución de conflictos.",
  },
  {
    id: "ci-cd",
    titulo: "Integración y entrega continua",
    nivel: "intermedio",
    horas: 16,
    descripcion: "Pipelines, entornos efímeros, despliegues progresivos y rollback.",
  },
  {
    id: "seguridad-web",
    titulo: "Seguridad en aplicaciones web",
    nivel: "avanzado",
    horas: 20,
    descripcion: "OWASP Top 10, headers HTTP, CSP, autenticación y manejo de secretos.",
  },
  {
    id: "cloud-serverless",
    titulo: "Arquitecturas serverless",
    nivel: "avanzado",
    horas: 24,
    descripcion: "Funciones, contenedores gestionados, colas de mensajes y costos.",
  },
  {
    id: "react-fundamentos",
    titulo: "React desde cero",
    nivel: "inicial",
    horas: 18,
    descripcion: "Componentes, estado, efectos y composición.",
  },
  {
    id: "observabilidad",
    titulo: "Observabilidad y SRE",
    nivel: "intermedio",
    horas: 14,
    descripcion: "Logs estructurados, métricas, trazas, SLOs y alertas.",
  },
];
