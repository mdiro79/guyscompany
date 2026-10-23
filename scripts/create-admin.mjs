// Creates the first admin account in Supabase (run once after migrations).
// Usage: node --env-file=.env.local scripts/create-admin.mjs <username> <display name> <password>
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const [username, displayName, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <username> <display name> <password(min 8)>');
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({ email: `${username.toLowerCase()}@guyscompany.local`, password, email_confirm: true });
if (error) { console.error(error.message); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
await sql`insert into profiles (id, username, display_name, role, must_change_password) values (${data.user.id}, ${username.toLowerCase()}, ${displayName || username}, 'admin', true)`;
await sql`update offices set owner_id = ${data.user.id} where slot = 1 and owner_id is null`;
await sql.end();
console.log(`Admin ${username} created. Sign in and change the password.`);
