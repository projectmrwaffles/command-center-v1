const fs = require("fs");
const path = require("path");

const BANNED_PACKAGE_VERSIONS = Object.freeze({
  next: new Set(["15.3.0"]),
  "eslint-config-next": new Set(["15.3.0"]),
});

function loadPackageJson(repoWorkspacePath) {
  if (!repoWorkspacePath) return null;
  const packageJsonPath = path.join(repoWorkspacePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
}

function collectDependencyVersions(pkg) {
  return {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };
}

function inspectRepoFrameworkVersionPolicy(repoWorkspacePath) {
  const packageJsonPath = path.join(repoWorkspacePath || "", "package.json");
  const pkg = loadPackageJson(repoWorkspacePath);
  if (!pkg) {
    return {
      ok: true,
      packageJsonPath,
      violations: [],
      packageVersions: {},
      reason: fs.existsSync(packageJsonPath) ? "package.json could not be parsed" : "package.json not found",
    };
  }

  const packageVersions = collectDependencyVersions(pkg);
  const violations = [];

  for (const [packageName, bannedVersions] of Object.entries(BANNED_PACKAGE_VERSIONS)) {
    const version = packageVersions[packageName];
    if (!version) continue;
    if (bannedVersions.has(version)) {
      violations.push({
        packageName,
        version,
        packageJsonPath,
        reason: `${packageName}@${version} is blocked by Command Center's framework version policy`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    packageJsonPath,
    violations,
    packageVersions,
    reason: null,
  };
}

function formatFrameworkVersionViolations(violations) {
  if (!Array.isArray(violations) || violations.length === 0) return "";
  return violations
    .map((violation) => `${violation.packageName}@${violation.version} in ${violation.packageJsonPath}`)
    .join(", ");
}

module.exports = {
  BANNED_PACKAGE_VERSIONS,
  collectDependencyVersions,
  inspectRepoFrameworkVersionPolicy,
  formatFrameworkVersionViolations,
};
