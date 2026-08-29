export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-12">
      <div className="cf-card w-full max-w-md p-8">
        <h1 className="mb-6 font-display text-xl font-semibold text-ink-950">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

export function Field({
  label,
  name,
  type = "text",
  errors,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  errors?: string[];
  hint?: string;
}) {
  return (
    <div>
      <label className="cf-label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} className="cf-input" required />
      {hint && !errors?.length && (
        <p className="mt-1 text-xs text-ink-700/60">{hint}</p>
      )}
      {errors?.map((err) => (
        <p key={err} className="cf-error">
          {err}
        </p>
      ))}
    </div>
  );
}
