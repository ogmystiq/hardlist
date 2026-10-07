// Raderar den inloggade användarens konto: inloggningen i auth.users och,
// via on delete cascade, all data som pekar på den. Måste ligga här och inte
// i webbläsaren eftersom admin-anropet kräver den hemliga nyckeln.
//
// Varje ny tabell med användardata måste referera auth.users med
// on delete cascade, annars blir den kvar när kontot raderas.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const TILLATNA_URSPRUNG = new Set([
  "https://hardlist.se",
  "http://localhost:8080",
]);

function corsHuvuden(ursprung: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
  if (ursprung && TILLATNA_URSPRUNG.has(ursprung)) {
    h["Access-Control-Allow-Origin"] = ursprung;
  }
  return h;
}

function svar(status: number, data: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Nyare projekt får nycklarna som JSON i SUPABASE_SECRET_KEYS, äldre har
// bara SUPABASE_SERVICE_ROLE_KEY. Läs det som finns.
function hemligNyckel(): string | undefined {
  const lista = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (lista) {
    try {
      const nycklar = JSON.parse(lista);
      if (nycklar.default) return nycklar.default;
    } catch { /* faller tillbaka nedan */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req) => {
  const cors = corsHuvuden(req.headers.get("Origin"));

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return svar(405, { fel: "Bara POST" }, cors);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return svar(401, { fel: "Inte inloggad" }, cors);

  const url = Deno.env.get("SUPABASE_URL");
  const nyckel = hemligNyckel();
  if (!url || !nyckel) return svar(500, { fel: "Funktionen saknar nyckel" }, cors);

  const admin = createClient(url, nyckel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getUser frågar auth-servern, så en förfalskad eller utgången token
  // avvisas här — id:t som raderas kommer aldrig från anroparen själv.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return svar(401, { fel: "Ogiltig inloggning" }, cors);

  // Kaskaden tar bort tabellraderna men inte filerna i Storage. Bilderna tas
  // bort först, och går det inte raderas inte kontot heller — hellre ett
  // nytt försök än en bild kvar utan ägare.
  const bilder = admin.storage.from("profilbilder");
  for (;;) {
    const { data: filer, error: listfel } = await bilder.list(data.user.id, { limit: 100 });
    if (listfel) {
      console.error("Kunde inte lista profilbilderna", listfel.message);
      return svar(500, { fel: "Kunde inte radera profilbilden" }, cors);
    }
    if (!filer || filer.length === 0) break;
    const { error: bildfel } = await bilder.remove(filer.map((f) => `${data.user.id}/${f.name}`));
    if (bildfel) {
      console.error("Kunde inte radera profilbilderna", bildfel.message);
      return svar(500, { fel: "Kunde inte radera profilbilden" }, cors);
    }
  }

  const { error: raderingsfel } = await admin.auth.admin.deleteUser(data.user.id);
  if (raderingsfel) {
    console.error("deleteUser misslyckades", raderingsfel.message);
    return svar(500, { fel: "Kunde inte radera kontot" }, cors);
  }

  return svar(200, { raderad: true }, cors);
});
