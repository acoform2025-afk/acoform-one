type FieldProps = {
  label: string; name: string; type?: string; placeholder?: string;
  errors?: string[]; autoComplete?: string; required?: boolean; defaultValue?: string;
};

export function Field({ label, name, type = "text", placeholder, errors, autoComplete, required = true, defaultValue }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</label>
      <input
        id={name} name={name} type={type} placeholder={placeholder} autoComplete={autoComplete}
        required={required} defaultValue={defaultValue}
        aria-invalid={errors && errors.length > 0}
        className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 placeholder:text-graphite-600 transition-colors focus:border-signal-amber focus:outline-none"
      />
      {errors?.length ? <p className="text-xs text-signal-red">{errors[0]}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, options, required = true, defaultValue }: {
  label: string; name: string; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</label>
      <select id={name} name={name} required={required} defaultValue={defaultValue}
        className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
        {!required && <option value="">— Not set —</option>}
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}
