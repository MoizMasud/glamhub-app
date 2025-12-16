import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");

  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("CLEANUP_SUPABASE_URL")!;
  const key = Deno.env.get("CLEANUP_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .in("status", ["cancelled", "completed"])
    .lt("status_changed_at", cutoff)
    .select("id");

  if (error) {
    console.error("Cleanup failed:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, deleted: data?.length ?? 0, cutoff }), {
    headers: { "Content-Type": "application/json" },
  });
});
    