// Standard text of the ACOFORM techno-commercial proposal, taken from the company's own
// quotation documents (R1_031 Full Set, R1_032 Vertical Set). Edit here to change every PDF.

export type FormworkKind = "monolithic" | "vertical";

export const SET_LABEL: Record<FormworkKind, string> = { monolithic: "Full Set", vertical: "Vertical Set" };

export const ADVANTAGES = [
  "Provide support for converting RCC drawings to Aluminum Formwork drawings.",
  "We are providing full welded run L - extrusion & C - extrusion.",
  "We provide dedicated support for installation and training following the supply of Aluminium Formwork at the site, ensuring seamless implementation and proficiency.",
  "We utilize 6061-T6 alloy of aluminium for manufacturing purposes, facilitating up to 150-200 repetitions when used appropriately and maintained regularly.",
  "We employ CNC Technology for cutting and welding processes, ensuring the consistent high quality of our panels.",
  "Average Approx. Weight per/sqm 18 to 19 kg/m2 in Vertical.",
  "Average Approx. Weight per/sqm 20 to 21 kg/m2 in Full Set.",
  "Load bearing capacity of panels; Wall Panel - 60 to 80 kN /m2.",
  "Thickness of panels; Standard Panels - 4 mm Thick ± 0.2 mm.",
  "Lacquer Coating surface finish with thickness ranging from 15 to 20 micron (dft) or Powder Coating surface finish with a thickness ranging from 65 to 70 microns (dft).",
];

export const DEFAULT_PAYMENT_TERMS: Record<FormworkKind, string[]> = {
  monolithic: [
    "30% advance along with Purchase Order (P.O.).",
    "35% after Shell Plan Approval.",
    "35% amount to be paid before dispatch from factory against Proforma Invoice of readiness of material.",
  ],
  vertical: [
    "50% Advance along with Purchase Order (P.O.).",
    "Remaining 50% amount to be paid before dispatch of material from the factory.",
  ],
};

export const DELIVERY_SCHEDULE = [
  "Shell plan design R0 will be submitted within 7 days after receipt of complete drawings, order and advance.",
  "Shell plan approval within one weeks after submitting the R0 version to the customer.",
  "Any changes in drawings after approval of shell plan will need re-design and re-approval of shell plan and will be undertaken subject to confirmation on design charges and revised delivery schedule.",
  "Design and production of Aluminium Formwork for the typical floor set will be within 60 days after shell plan approval.",
  "Dispatches will commence on receipt of the payments and may need 15 days time.",
  "Design and Production of Aluminium Formwork for floor changes will add 10 days for design and 30 days for production per floor respectively.",
];

export const SCHEDULE_NOTE =
  "The final quantity will be calculated in accordance with the client-issued shell drawings and ACOFORM’s final modulation drawings.";

type Spec = [string, string];
const SPEC_COMMON_HEAD: Spec[] = [
  ["Aluminium Face Thickness", "4.0 mm ± 0.2 mm"],
  ["Side Rail Dimension", "65 mm x 8 mm Thk ± 0.2 mm"],
  ["Aluminium Monolithic System Average Weight", "21 Kg/Sqm ± 1 Kg"],
  ["MS Components Average Weight", "9 Kg/Sqm ± 1 Kg"],
  ["Side Rail Hole Pattern", "@ 50 mm c/c + Acoform Pattern Along the Length"],
  ["Total Stiffeners in Single Panel", "8 Nos"],
];
function specs(stiffener: string, wire: string, maxHeight: string): Spec[] {
  return [
    ...SPEC_COMMON_HEAD,
    ["Stiffener Type", stiffener],
    ["Aluminium Extrusion", "6061 T6 Grade"],
    ["Welding Wire, Electrode & Grade", wire],
    ["Welding Type", "i) Friction Welding (FSW) – Upcoming\nii) Robotic Welding – Upcoming\niii) Manual Welding"],
    ["Load Capacity of Panel", "60 kN/m2"],
    ["Corner Gussets", "Triangular Gusset (4 mm Thick)"],
    ["Material Hardness", "80 -100 BHN"],
    ["Ultimate Tensile Strength", "310-350 N/mm²"],
    ["Rate of Pour of Concrete", "1 Mtr/Hr"],
    ["Max Height", maxHeight],
    ["Hole Diameters", "16 mm"],
    ["Accessories", "Good quality and best required grade of MS with plating"],
    ["Fixing Components", "Standard MS Pins, Wedges and Other Accessories (as per design)"],
    ["Props", "Adjustable MS Prop with pipe head and secondary with support plate with load capacity 20 KN"],
    ["Supporting System", "Double Set or required as per design"],
    ["Surface Finish", "Lacquer Coating or Powder Coating (GREY COLOR)"],
    ["Reuse for Next Project", "75% - 85% of Standard Panels"],
    ["Speed of Work & Cycle Time", "15-20 Sqm/Men/Day or 7 Working Days Cycle"],
    ["Wall thickness casting done by same panel", "Upto 450 mm with wall tie system and upto 1000 mm thick tie rod system"],
    ["Technical Support on Site", "Upto 1 Slab Casting"],
  ];
}
export const TECH_SPECS: Record<FormworkKind, Spec[]> = {
  monolithic: specs("I-Shape & Y-Shape Handle Stiffener", "5356 Aluminium Grade Electrode", "4500 mm"),
  vertical: specs("Y-Shape (2) & V-Shape (6) Handle Stiffener", "4043 Aluminium Grade Electrode", "2400 mm"),
};

// [item, description, unit, remarks]
export type Acc = [string, string, string, string];
/** One row of a quotation's own (edited) accessories list, as stored in quotations.accessories */
export type AccessoryRow = { item: string; description: string; unit: string; remarks: string };
const WALL_TIES = "330 MM (150 MM wall), 380 MM (200), 430 MM (250), 480 MM (300), 530 MM (350), 630 MM (450)";
const BY_WALL = "For 150 / 200 / 250 / 300 / 350 / 450 MM wall thickness";
const WALERS = "2650, 2050, 3500, 2400, 3000, 2500, 3200, 2900, 1600, 1580, 2000 MM";
export const ACCESSORIES: Record<FormworkKind, Acc[]> = {
  vertical: [
    ["Pin & Wedges", "50 MM long", "Nos.", "10% extra"],
    ["Wall Ties", WALL_TIES, "Nos.", "As per design"],
    ["Polythene Tube (53 MM)", BY_WALL, "Rmt", "10% extra"],
    ["Corrugated Polypropylene Sheet", BY_WALL, "Nos.", "10% extra"],
    ["Waler Bracket (L)", "—", "Nos.", "As per design"],
    ["Alignment Waler (one layer)", WALERS, "Nos.", "As per design"],
    ["Panel Puller", "—", "Nos.", "As per design"],
    ["Podger (Hole Bari)", "—", "Nos.", "As per design"],
    ["Wall Tie Remover", "—", "Nos.", "As per design"],
  ],
  monolithic: [
    ["Pin & Wedges", "50 MM long – 15 nos. per sqm", "Nos.", "—"],
    ["Joint Bar", "—", "Nos.", "As per design"],
    ["Long Pin", "138 MM long", "Nos.", "As per design"],
    ["Prop", "Adjustable prop 2M + 1.5M; adjustable prop 1M + 1M", "Nos.", "As per design"],
    ["Wall Ties", WALL_TIES, "Nos.", "As per design"],
    ["Polythene Tube (53 MM)", BY_WALL, "Rmt", "10% extra"],
    ["Corrugated Polypropylene Sheet", BY_WALL, "Nos.", "10% extra"],
    ["Rocker Bolt + Nut", "16 X 30 MM", "Nos.", "10% extra"],
    ["Spring Washer", "—", "Nos.", "10% extra"],
    ["SBE/PCE Bolt + Nut", "16 X 80 MM", "Nos.", "As per design"],
    ["SBE/PCE Washer", "—", "Nos.", "As per design"],
    ["Kicker Bolt + Nut", "10 X 75 MM", "Nos.", "As per design"],
    ["Flat Washer", "16 X 30 MM", "Nos.", "As per design"],
    ["PVC Kicker Cone", "16 MM internal dia.", "Nos.", "10% extra"],
    ["BKS", "300 MM long", "Nos.", "As per design"],
    ["Hexanut Welded Tie", "830 MM long (450 MM thk wall)", "Nos.", "As per design"],
    ["Brackets", "Type A 1000x600, B 800x400, C 800x450, D 800x300", "Nos.", "As per design"],
    ["Alignment Waler (50x50x2.5 MM sq. tube)", WALERS + " + corner walers", "Nos.", "As per design"],
    ["Hexanut Welded Tie", "630 MM long (250 MM thk wall)", "Nos.", "As per design"],
    ["Wing Nut", "—", "Nos.", "As per design"],
    ["PVC Cone", "—", "Nos.", "10% extra"],
    ["PVC Pipe (22 MM dia.)", "300 / 450 / 650 MM long", "Nos.", "10% extra"],
    ["VS Tube", "800 / 1100 MM long, SP soldier", "Nos.", "As per design"],
    ["Panel Puller", "—", "Nos.", "As per design"],
    ["Podger (Hole Bari)", "—", "Nos.", "As per design"],
    ["Wall Tie Remover", "—", "Nos.", "As per design"],
  ],
};

// [heading, paragraphs or bullets]
export const TERMS: { title: string; text?: string; bullets?: string[] }[] = [
  { title: "Scope of Work", text: "Supply of new Aluminium Formwork System for your project as per your drawing including shell plan, modulation drawings, raw material purchase, manufacturing, packing and dispatch with accessories." },
  { title: "Exclusion", text: "We will not agree to incorporate or implement any modification, drawing change revision or other change until the client has accepted our calculation of the cost and time for implementing such change. All consumables will be extra and in buyer scope. Shutter installation, hardware accessories machinery and cranes are not in our scope hardware can be supplied as per requirement at additional cost." },
  { title: "Inclusive", text: "Scope as per mentioned in the price schedule." },
  { title: "Transport", bullets: [
    "After receipt of advance client should give clear address of site location accordingly material to be shift.",
    "If transport is arranged by us, all expenses including transit insurance should be borne by us.",
    "If transport is arranged by client, all expenses including transit insurance should be borne by Client.",
    "Prior intimation is required in case of material return/rejection back to us.",
  ] },
  { title: "Measurement", text: "The measurement of the formwork will be taken as UoM mentioned in the price schedule, actual formwork panels surface area (not the concrete surface area) will be measured & same will be considered for billing." },
  { title: "Client Input", bullets: [
    "Final architectural GFC drawings.",
    "Final Architectural Drawings.",
    "All side building elevation & sections.",
    "Changes Floors Plans and details if any.",
    "Client shall provide delivery schedule for the total material to be delivered as per mutually agreed timeline, against which LOI shall be released by the buyer.",
    "Quotation indication of costs and quantity, commitments given by us are based on the assumption of the validity of the information provided by you being fully accurate and correct in all circumstance.",
    "If any stock, raw material is affected by modification of order or change then the client shall be liable to absorb the cost and accept the material in their current state.",
  ] },
  { title: "Local Issues", text: "Client shall take care of location base issue like Mathadi Union, Local Labour problem and any other issues, expenses will be in borne by client." },
  { title: "GST", text: "Invoice will be raised as per prevailing GST rate which is applicable at time of dispatch. E-way will be raised on the address give on Purchase Order (PO) or Letter of Intent (LOI)." },
  { title: "Price", text: "Above price schedule is excluding mock-up charges. If client require mock-up then additional charges would be Rs. 50/Sqm. The material title and ownership would remain us until client pay all the dues." },
  { title: "Order Cancellation Charges", text: "The cancellation fee will be minimum 30% on order value. It will be raised depending upon the progress of work done. The decision of levying the amount of cancellation charges will solely rest with supplier and will have to be accepted by the customer. The advance amount, if any, will be adjusted against cancellation fee." },
  { title: "Confidentiality", text: "Information disclose under this contract will be treated as a confidential information and both the parties should safe guard the interest of each other. Client should not use or disclose such information without written consent of us." },
  { title: "Force Majeure", text: "In the event either party is unable to perform its obligation under the terms of this agreement because of act of God, strikes, power failure, internet service, pandemic, flood situation, labour unrest, earthquake etc. or any other reason which is beyond control of both the party, in such situations both the parties mutually discuss and settled the situation." },
  { title: "Jurisdiction", text: "In case of any dispute relating to this contract, Pune court will be having exclusive jurisdiction for such dispute." },
  { title: "Other Terms & Conditions", bullets: [
    "Each party should continue to own the intellectual property right in all documents, goods and services owned by the party prior to the date of the contract.",
    "We shall hold the intellectual property right in all documents material and services created during the contract.",
    "Our technician will guide & assist your team of workers/fitters/carpenters for the setting up of the formwork system.",
    "A person who is not party to the contract shall have no right under the contract.",
  ] },
];

export const CLOSING = [
  "We trust our quotation will meet your requirement basis and our competencies & skills too. In case you need any further clarification, please do feel free to contact us.",
  "We await your prompt response and the issuance of your valued purchase order.",
];

export function formworkKind(t: string | null | undefined): FormworkKind {
  return t === "vertical" ? "vertical" : "monolithic";
}

/** "ACOFORM/QUOTE/26-27/031R1" -> { seq: "031", rev: 1 } */
export function parseCode(code: string, revisionNo: number | null | undefined) {
  const m = code.match(/(\d{2,})(?:R(\d+))?$/);
  return { seq: m?.[1] ?? code.replace(/[^\w-]+/g, "_"), rev: revisionNo ?? (m?.[2] ? Number(m[2]) : 0) };
}

/** Matches the office naming: "R1_032 Quote - Acoform Vertical Set (30-06-26).pdf" */
export function pdfFileName(code: string, revisionNo: number | null | undefined, kind: FormworkKind, isoDate: string) {
  const { seq, rev } = parseCode(code, revisionNo);
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `R${rev}_${seq} Quote - Acoform ${SET_LABEL[kind]} (${d}-${m}-${y.slice(2)}).pdf`;
}

/** Standard accessories list for a formwork type, as editable rows. */
export function standardAccessories(kind: FormworkKind): AccessoryRow[] {
  return ACCESSORIES[kind].map(([item, description, unit, remarks]) => ({ item, description, unit, remarks }));
}

/** The accessories list to print: the quotation's edited list, or the standard one when it was never edited. */
export function accessoriesFor(kind: FormworkKind, custom: unknown): Acc[] {
  if (Array.isArray(custom)) {
    return (custom as Partial<AccessoryRow>[]).map((r) => [r.item ?? "", r.description ?? "", r.unit ?? "", r.remarks ?? ""]);
  }
  return ACCESSORIES[kind];
}

