const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = process.env.STACKFRP_HOME || path.join(os.homedir(), ".stackfrp");
const STACKEDGE_HOME = process.env.STACKEDGE_HOME || path.join(os.homedir(), ".stackedge");
const STACKEDGE_APPS = path.join(STACKEDGE_HOME, "apps.json");
const VERCEL_DIR = path.join(STACKEDGE_HOME, "vercel");

function appDir(name) {
  return path.join(VERCEL_DIR, name);
}

function deploymentFile(name) {
  return path.join(appDir(name), "deployment.json");
}

function credentialsFile(name) {
  return path.join(appDir(name), "credentials.json");
}

function connectionFile(name) {
  return path.join(appDir(name), "connection.json");
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode });
  try {
    fs.chmodSync(file, mode);
  } catch {}
}

function loadDeployment(name) {
  return readJson(deploymentFile(name));
}

function loadCredentials(name) {
  return readJson(credentialsFile(name));
}

function saveConnection(name, value) {
  writeJson(connectionFile(name), value);
}

function resolveStackedgeTarget(name) {
  const apps = readJson(STACKEDGE_APPS);
  if (!Array.isArray(apps)) {
    throw new Error(`Stackedge registry not found: ${STACKEDGE_APPS}`);
  }

  const app = apps.find(a => a.name === name);
  if (!app) throw new Error(`App '${name}' is not in ${STACKEDGE_APPS}`);

  const http = Array.isArray(app.ports) ? app.ports.find(p => p.virtual === 80) : null;
  const backendPort = http ? http.target : null;
  const securityPort = app.securityPort || null;

  if (!securityPort && !backendPort) {
    throw new Error(`App '${name}' has no listening port in the Stackedge registry`);
  }

  return {
    app,
    port: securityPort || backendPort,
    securityPort,
    backendPort,
    protected: Boolean(securityPort)
  };
}

module.exports = {
  HOME,
  STACKEDGE_HOME,
  STACKEDGE_APPS,
  VERCEL_DIR,
  appDir,
  deploymentFile,
  credentialsFile,
  connectionFile,
  readJson,
  writeJson,
  loadDeployment,
  loadCredentials,
  saveConnection,
  resolveStackedgeTarget
};
