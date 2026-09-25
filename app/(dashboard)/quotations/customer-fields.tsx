// Customer block shared by the detailed and quick quotation forms.
// Leave blank when a lead is linked — the database copies the lead's contact details.

const input =
  "rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 placeholder:text-graphite-600 focus:border-signal-amber focus:outline-none";

function F({ name, label, type = "text", placeholder, required, wide }: {
  name: string; label: string; type?: string; placeholder?: string; required?: boolean; wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "col-span-2" : ""}`}>
      <label htmlFor={name} className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} className={input} />
    </div>
  );
}

export function CustomerFields() {
  return (
    <fieldset className="col-span-2 grid grid-cols-2 gap-4 rounded-md border border-graphite-800 p-4">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-signal-amber">Customer</legend>
      <F name="customerName" label="Company name" required placeholder="Omni Enterprises" />
      <F name="kindAttn" label="Contact person (Kind Attn)" placeholder="Mr. Neel Dani" />
      <F name="customerPhone" label="Phone" type="tel" placeholder="98xxxxxxxx" />
      <F name="customerEmail" label="Email" type="email" placeholder="name@company.com" />
      <F name="customerGstin" label="Customer GSTIN" placeholder="24ABCDE1234F1Z5" />
      <F name="projectName" label="Project / site name" placeholder="Tower A, Shela" />
      <F name="customerAddress" label="City / address" placeholder="Ahmedabad, Gujarat" wide />
      <p className="col-span-2 text-xs text-graphite-500">Linked a lead? Leave contact fields blank and they are copied from the lead.</p>
    </fieldset>
  );
}
