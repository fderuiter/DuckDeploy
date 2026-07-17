import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function isIgnored(name) {
  if (name.startsWith('__') || name.startsWith('.')) return true;
  if (['node_modules', 'dist', 'config', 'workers', 'assets', 'internal', 'private', 'generated'].includes(name)) return true;
  return false;
}

function findEntryPoints(baseDir, startPath) {
  const entries = [];
  const fullPath = path.join(baseDir, startPath);
  if (!fs.existsSync(fullPath)) return entries;
  
  const files = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      if (!isIgnored(file.name)) {
        const dirPath = path.join(fullPath, file.name);
        const hasTsFiles = fs.readdirSync(dirPath).some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
        if (hasTsFiles) {
           entries.push(path.join(startPath, file.name));
        }
      }
    }
  }
  return entries;
}

async function main() {
  const pkgEntries = [];
  const pkgsPath = path.join(process.cwd(), 'packages');
  if (fs.existsSync(pkgsPath)) {
    const pkgs = fs.readdirSync(pkgsPath, { withFileTypes: true });
    for (const pkg of pkgs) {
        if (pkg.isDirectory() && fs.existsSync(path.join(pkgsPath, pkg.name, 'src'))) {
            pkgEntries.push(path.join('packages', pkg.name, 'src'));
        }
    }
  }

  const allEntryPoints = [
      ...findEntryPoints(process.cwd(), 'src'),
      ...pkgEntries,
      'server',
      'scripts/compiler'
  ].map(p => p.replace(/\\/g, '/'));

  const originalEntryPoints = [
    "src/core",
    "src/utils",
    "src/components",
    "packages/openapi/src",
    "server",
    "scripts/compiler"
  ];

  const newlyDiscovered = allEntryPoints.filter(ep => !originalEntryPoints.includes(ep));
  
  const config = {
    entryPoints: allEntryPoints,
    entryPointStrategy: "expand",
    tsconfig: "tsconfig.docs.json",
    out: "docs",
    excludePrivate: true,
    excludeProtected: true,
    exclude: ["**/*+(.test|.spec).*", "**/__tests__/**", "**/generated/**"],
    name: "DuckDeploy Documentation",
    readme: "none",
    projectDocuments: ["manual-guides/**/*.md"],
    validation: {
        notDocumented: true
    }
  };
  fs.writeFileSync('typedoc.tmp.json', JSON.stringify(config, null, 2));

  console.log("Running TypeDoc...");
  const result = spawnSync('npx', ['typedoc', '--options', 'typedoc.tmp.json'], { encoding: 'utf-8' });
  
  fs.unlinkSync('typedoc.tmp.json');
  
  const stderr = result.stderr || '';
  const stdout = result.stdout || '';

  let newErrors = 0;
  const lines = stderr.split('\n');
  for (const line of lines) {
      if (line.includes('does not have any documentation')) {
          let isNew = false;
          for (const ep of newlyDiscovered) {
              if (line.includes(`/${ep}/`)) isNew = true;
              else if (ep.startsWith('packages/')) {
                  const pkgName = ep.split('/')[1];
                  if (line.includes(`@duckdeploy/${pkgName}/`)) isNew = true;
              }
          }
          if (isNew) {
              console.error(`[ERROR] Undocumented public export found in newly discovered module:\n  ${line}`);
              newErrors++;
          }
      }
  }
  
  if (newErrors > 0) {
      console.error(`\nBuild failed: Found ${newErrors} newly auto-discovered public exports lacking documentation.`);
      process.exit(1);
  } else if (result.status !== 0) {
      console.error(`\nBuild failed: TypeDoc exited with status ${result.status}.\n${stderr}`);
      process.exit(result.status);
  } else {
      console.log("\nBuild successful: All newly auto-discovered public exports have documentation (or were ignored).");
  }
}
main().catch(console.error);
