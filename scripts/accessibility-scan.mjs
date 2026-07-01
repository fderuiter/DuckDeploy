import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const manifestPath = path.resolve(distDir, 'ui-manifest.json');

async function waitForServer(url) {
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(true));
        }).on('error', reject);
      });
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

async function run() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    console.error('Failed to read manifest', err);
    process.exit(1);
  }

  const resources = Object.keys(manifest.resources || {});
  console.log(`Found resources: ${resources.length}`);

  const serverProcess = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    stdio: 'ignore',
    shell: true
  });

  console.log('Waiting for preview server to start...');
  const serverReady = await waitForServer('http://localhost:4173/DuckDeploy/favicon.svg');
  if (!serverReady) {
    console.error('Preview server failed to start');
    serverProcess.kill();
    process.exit(1);
  }
  console.log('Preview server is ready.');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  
  let hasViolations = false;
  const allResults = {};

  const routesToTest = ['/', ...resources.map(r => `/#/${encodeURIComponent(r)}`)];

  for (const route of routesToTest) {
    console.log(`Testing route: ${route}`);
    await page.goto(`http://localhost:4173/DuckDeploy${route}`, { waitUntil: 'networkidle0' });
    
    await new Promise(r => setTimeout(r, 2000));
    
    const results = await new AxePuppeteer(page)
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();
      
    allResults[route] = results.violations;

    if (results.violations.length > 0) {
      hasViolations = true;
      console.log(`Violations found on ${route}:`);
      results.violations.forEach(v => {
        console.log(`- ${v.id} [${v.impact}]: ${v.description}`);
      });
    } else {
      console.log(`No violations found on ${route}`);
    }
  }

  await browser.close();
  serverProcess.kill();

  // Save the report
  const reportPath = path.resolve(__dirname, '../a11y-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`Report saved to ${reportPath}`);

  if (hasViolations) {
    console.error('Accessibility violations found (WCAG AA). Failing build.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
