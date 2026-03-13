import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

const JUNCTION_DIR = path.join(os.tmpdir(), 'agent-bridge-test');

function createJunction(): string {
  const cwd = process.cwd();
  
  if (!cwd.includes(' ')) {
    return cwd;
  }

  if (fs.existsSync(JUNCTION_DIR)) {
    try {
      fs.rmdirSync(JUNCTION_DIR);
    } catch {
      // Junction might be stale or in use
    }
  }

  fs.mkdirSync(path.dirname(JUNCTION_DIR), { recursive: true });
  
  const { execSync } = require('child_process');
  try {
    execSync(`mklink /J "${JUNCTION_DIR}" "${cwd}"`, { shell: true, stdio: 'pipe' });
    return JUNCTION_DIR;
  } catch {
    console.warn('Failed to create junction, using original path');
    return cwd;
  }
}

async function main() {
  try {
    const originalCwd = process.cwd();
    const workingDir = createJunction();
    
    const extensionDevelopmentPath = workingDir;
    const extensionTestsPath = path.join(workingDir, 'out', 'test', 'suite', 'index.js');

    console.log('Original path:', originalCwd);
    console.log('Working path:', workingDir);
    console.log('Extension development path:', extensionDevelopmentPath);
    console.log('Extension tests path:', extensionTestsPath);

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
