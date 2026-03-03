const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runSql(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Running ${filePath}...`);
  
  // Split by statement terminator and run each
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`Found ${statements.length} statements`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    console.log(`\n[${i + 1}/${statements.length}] ${stmt.substring(0, 80)}...`);
    
    // Supabase limited support - using rpc for raw SQL
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        console.error(`  ERROR:`, error.message);
        // Continue to next statement
      } else {
        console.log(`  OK`);
      }
    } catch (e) {
      console.error(`  EXCEPTION:`, e.message);
    }
  }
}

async function main() {
  console.log('=== Command Center Migration Runner ===\n');
  
  const schemaFile = path.join(__dirname, '..', 'supabase', 'migrations', '20250301130000_v1_schema.sql');
  const seedFile = path.join(__dirname, '..', 'supabase', 'migrations', '20250301130001_v1_seed.sql');
  
  console.log('Running schema migration...');
  await runSql(schemaFile);
  
  console.log('\n\nRunning seed migration...');
  await runSql(seedFile);
  
  console.log('\n=== Done ===');
}

main().catch(console.error);
