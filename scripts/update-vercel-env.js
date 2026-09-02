const { execSync } = require('child_process');

async function updateEnvVar(name, value) {
  try {
    // Use vercel CLI with piped input
    const input = `${value}\n`;
    const child = execSync(`echo "${value}" | vercel env update ${name} production --scope archk4lis-projects`, {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    console.log(`✅ Updated ${name} to ${value}`);
  } catch (e) {
    console.error(`❌ Failed to update ${name}:`, e.message);
  }
}

updateEnvVar('AI_MODEL', 'claude-fable-5');
