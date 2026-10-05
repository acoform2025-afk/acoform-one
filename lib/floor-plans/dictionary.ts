/** The company drawing dictionary from the database (server or browser Supabase client). */
import { normaliseDict, type Dictionary } from "./vocab";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadDictionary(supabase: any): Promise<Dictionary> {
  try {
    const { data } = await supabase.from("drawing_dictionary").select("terms, layers").maybeSingle();
    return normaliseDict(data);
  } catch { return normaliseDict(null); }
}
