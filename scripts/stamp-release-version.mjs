import { readFileSync, writeFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TAG_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function versionFromTag(tag) {
  const match = TAG_VERSION.exec(tag ?? "");
  if (!match) {
    throw new Error(`Tag "${tag ?? ""}" must look like v1.2.3.`);
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function replaceLeadingVersions(text, version, count) {
  let seen = 0;
  const next = text.replace(/"version": "[^"]*"/g, (original) => {
    seen += 1;
    return seen <= count ? `"version": "${version}"` : original;
  });
  if (seen < count) {
    throw new Error(
      `Expected at least ${count} version fields, found ${seen}.`,
    );
  }
  return next;
}

function stampCargoToml(text, version) {
  const next = text.replace(/^version = "[^"]*"/m, `version = "${version}"`);
  if (next === text) {
    throw new Error("Cargo.toml is missing its package version.");
  }
  return next;
}

function stampCargoLock(text, version) {
  const pattern = /(name = "atrium"\r?\nversion = ")[^"]+"/;
  if (!pattern.test(text)) {
    throw new Error("Cargo.lock is missing the atrium package.");
  }
  return text.replace(pattern, `$1${version}"`);
}

export function stampReleaseVersion(root, tag) {
  const version = versionFromTag(tag);
  const read = (relative) => readFileSync(resolve(root, relative), "utf8");
  const write = (relative, contents) => {
    writeFileSync(resolve(root, relative), contents);
  };

  const packageJson = replaceLeadingVersions(read("package.json"), version, 1);
  const packageLock = replaceLeadingVersions(
    read("package-lock.json"),
    version,
    2,
  );
  const tauriConf = replaceLeadingVersions(
    read("src-tauri/tauri.conf.json"),
    version,
    1,
  );
  const parsedPackage = JSON.parse(packageJson);
  const parsedLock = JSON.parse(packageLock);
  const parsedTauri = JSON.parse(tauriConf);
  if (
    parsedPackage.version !== version ||
    parsedLock.version !== version ||
    parsedLock.packages?.[""]?.version !== version ||
    parsedTauri.version !== version
  ) {
    throw new Error("The package version fields were not all updated.");
  }

  write("package.json", packageJson);
  write("package-lock.json", packageLock);
  write("src-tauri/tauri.conf.json", tauriConf);
  write(
    "src-tauri/Cargo.toml",
    stampCargoToml(read("src-tauri/Cargo.toml"), version),
  );
  write(
    "src-tauri/Cargo.lock",
    stampCargoLock(read("src-tauri/Cargo.lock"), version),
  );
  return version;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  normalize(fileURLToPath(import.meta.url)) ===
    normalize(resolve(process.argv[1]));

if (isDirectRun) {
  const tag = process.env.RELEASE_TAG || process.argv[2];
  if (!tag) {
    console.error("Set RELEASE_TAG or pass a tag like v1.2.3.");
    process.exit(1);
  }
  const version = stampReleaseVersion(process.cwd(), tag);
  console.log(`Stamped package version ${version} from ${tag}.`);
}
