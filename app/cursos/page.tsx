import { cursos } from "@/lib/cursos";
import FiltroCursos from "../components/FiltroCursos";

export const metadata = {
  title: "Cursos | Catálogo de Cursos",
};

export default function CursosPage() {
  return (
    <section>
      <h1>Cursos disponibles</h1>
      <p className="hint">
        El filtro de abajo es un componente de cliente (necesita JavaScript). Si después de
        aplicar la CSP deja de funcionar, ya sabés por dónde empezar a investigar.
      </p>
      <FiltroCursos cursos={cursos} />
    </section>
  );
}
