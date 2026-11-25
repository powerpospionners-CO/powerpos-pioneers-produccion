// Campo invisible para personas y lectores de pantalla; muchos bots lo llenan y la API los rechaza.
export default function CampoTrampa({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="store-trap" aria-hidden="true">
      <label>
        Sitio web
        <input
          tabIndex={-1}
          autoComplete="off"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
