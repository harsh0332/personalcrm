import { createClient } from "@supabase/supabase-js";

const url = "https://oglhztdqdwkbopcldyyl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGh6dGRxZHdrYm9wY2xkeXlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjAyMjI4MiwiZXhwIjoyMTAxNTk4MjgyfQ.Y1Mz_I43TGOcMn-8zg9DxQttMssDZIEOpAwtZn4PWuE";

const supabase = createClient(url, serviceRoleKey);

async function main() {
  const { data, error } = await supabase.from("dispositions").select("*");
  console.log("Dispositions query result:", { data, error });
}

main();
