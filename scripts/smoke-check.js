#!/usr/bin/env node

/**
 * Smoke check script for Chat Distiller Chrome extension.
 * Validates manifest integrity, locale JSON syntax and key consistency,
 * referenced HTML assets, and JavaScript syntax without third-party dependencies.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..");

const errors = [];
let checksPassed = 0;

function logPass(message) {
  checksPassed += 1;
  console.log(`\x1b[32m✔\x1b[0m ${message}`);
}

function logFail(message) {
  errors.push(message);
  console.error(`\x1b[31m✖\x1b[0m ${message}`);
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    logFail(`${label} does not exist: ${filePath}`);
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    logFail(`Invalid JSON in ${label} (${filePath}): ${error.message}`);
    return null;
  }
}

function collectManifestPaths(manifest) {
  const referenced = new Set();

  if (manifest.icons && typeof manifest.icons === "object") {
    for (const iconPath of Object.values(manifest.icons)) {
      referenced.add(iconPath);
    }
  }

  if (manifest.background?.service_worker) {
    referenced.add(manifest.background.service_worker);
  }

  if (manifest.action?.default_popup) {
    referenced.add(manifest.action.default_popup);
  }

  if (manifest.action?.default_icon && typeof manifest.action.default_icon === "object") {
    for (const iconPath of Object.values(manifest.action.default_icon)) {
      referenced.add(iconPath);
    }
  }

  if (manifest.side_panel?.default_path) {
    referenced.add(manifest.side_panel.default_path);
  }

  if (Array.isArray(manifest.content_scripts)) {
    for (const scriptEntry of manifest.content_scripts) {
      if (Array.isArray(scriptEntry.js)) {
        for (const jsFile of scriptEntry.js) referenced.add(jsFile);
      }
      if (Array.isArray(scriptEntry.css)) {
        for (const cssFile of scriptEntry.css) referenced.add(cssFile);
      }
    }
  }

  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const resourceEntry of manifest.web_accessible_resources) {
      if (Array.isArray(resourceEntry.resources)) {
        for (const resource of resourceEntry.resources) {
          if (!resource.includes("*")) referenced.add(resource);
        }
      }
    }
  }

  return referenced;
}

function validateManifest(rootDir) {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = readJsonFile(manifestPath, "manifest.json");
  if (!manifest) return null;

  if (manifest.manifest_version !== 3) {
    logFail("manifest.json must have manifest_version: 3");
  }

  if (!manifest.name) logFail("manifest.json is missing 'name'");
  if (!manifest.version) logFail("manifest.json is missing 'version'");
  if (!manifest.description) logFail("manifest.json is missing 'description'");
  if (!manifest.default_locale) logFail("manifest.json is missing 'default_locale'");

  const referencedPaths = collectManifestPaths(manifest);
  for (const relativePath of referencedPaths) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      logFail(`Manifest references missing file: ${relativePath}`);
    }
  }

  logPass("manifest.json is valid MV3 JSON and all referenced assets exist");
  return manifest;
}

function validateLocales(rootDir, defaultLocale) {
  const localesDir = path.join(rootDir, "_locales");
  if (!fs.existsSync(localesDir)) {
    logFail(`_locales directory is missing at: ${localesDir}`);
    return;
  }

  const entries = fs.readdirSync(localesDir, { withFileTypes: true });
  const localeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (localeDirs.length === 0) {
    logFail("No locale directories found in _locales");
    return;
  }

  if (defaultLocale && !localeDirs.includes(defaultLocale)) {
    logFail(`Default locale '${defaultLocale}' directory is missing in _locales`);
  }

  const localeKeyMap = new Map();

  for (const lang of localeDirs) {
    const messagesPath = path.join(localesDir, lang, "messages.json");
    const messages = readJsonFile(messagesPath, `_locales/${lang}/messages.json`);
    if (!messages) continue;

    if (typeof messages !== "object" || Array.isArray(messages)) {
      logFail(`_locales/${lang}/messages.json must be a JSON object`);
      continue;
    }

    const keys = new Set(Object.keys(messages));
    for (const [key, value] of Object.entries(messages)) {
      if (!value || typeof value !== "object" || typeof value.message !== "string") {
        logFail(`_locales/${lang}/messages.json key '${key}' missing 'message' string`);
      }
    }
    localeKeyMap.set(lang, keys);
  }

  const baseLang = defaultLocale && localeKeyMap.has(defaultLocale)
    ? defaultLocale
    : localeDirs[0];

  const baseKeys = localeKeyMap.get(baseLang);
  if (baseKeys) {
    for (const [lang, keys] of localeKeyMap.entries()) {
      if (lang === baseLang) continue;

      const missingKeys = [...baseKeys].filter((k) => !keys.has(k));
      const extraKeys = [...keys].filter((k) => !baseKeys.has(k));

      if (missingKeys.length > 0) {
        logFail(`Locale '${lang}' is missing ${missingKeys.length} key(s) present in '${baseLang}': ${missingKeys.join(", ")}`);
      }
      if (extraKeys.length > 0) {
        logFail(`Locale '${lang}' has ${extraKeys.length} extra key(s) not in '${baseLang}': ${extraKeys.join(", ")}`);
      }
    }
  }

  logPass(`All locale message files are valid and key sets match across [${localeDirs.join(", ")}]`);
}

function findFilesByExtension(dir, ext, ignoreDirs = new Set(["node_modules", ".git", "docs", "scripts"])) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        if (!ignoreDirs.has(item.name)) traverse(fullPath);
      } else if (item.isFile() && item.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  }

  traverse(dir);
  return results;
}

function validateHtmlReferences(rootDir) {
  const htmlFiles = findFilesByExtension(rootDir, ".html");
  const assetRegex = /(?:src|href)=["']([^"']+)["']/gi;

  for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(htmlFile, "utf-8");
    const relativeHtmlPath = path.relative(rootDir, htmlFile);
    let match;

    while ((match = assetRegex.exec(content)) !== null) {
      const target = match[1];
      if (
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("//") ||
        target.startsWith("data:") ||
        target.startsWith("#") ||
        target.startsWith("mailto:")
      ) {
        continue;
      }

      const cleanPath = target.split("?")[0].split("#")[0];
      if (!cleanPath) continue;

      const resolvedPath = path.join(path.dirname(htmlFile), cleanPath);
      const rootResolvedPath = path.join(rootDir, cleanPath);

      if (!fs.existsSync(resolvedPath) && !fs.existsSync(rootResolvedPath)) {
        logFail(`HTML file '${relativeHtmlPath}' references missing asset: '${target}'`);
      }
    }
  }

  logPass(`Referenced local assets in HTML files are valid (${htmlFiles.length} HTML files verified)`);
}

function validateJavaScriptSyntax(rootDir) {
  const jsFiles = findFilesByExtension(rootDir, ".js", new Set(["node_modules", ".git", "scripts"]));

  if (jsFiles.length === 0) {
    logFail("No JavaScript files found to validate");
    return;
  }

  let syntaxErrors = 0;
  for (const jsFile of jsFiles) {
    const relativeJsPath = path.relative(rootDir, jsFile);
    const result = spawnSync(process.execPath, ["--check", jsFile], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      syntaxErrors += 1;
      logFail(`Syntax error in '${relativeJsPath}':\n${result.stderr.trim()}`);
    }
  }

  if (syntaxErrors === 0) {
    logPass(`All runtime JavaScript files passed syntax check (${jsFiles.length} files parsed)`);
  }
}

function main() {
  console.log(`Starting Chat Distiller smoke checks on: ${targetDir}\n`);

  const manifest = validateManifest(targetDir);
  validateLocales(targetDir, manifest?.default_locale || "en");
  validateHtmlReferences(targetDir);
  validateJavaScriptSyntax(targetDir);

  console.log("");
  if (errors.length > 0) {
    console.error(`\x1b[31mSmoke check failed with ${errors.length} error(s).\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll ${checksPassed} smoke checks passed successfully.\x1b[0m`);
    process.exit(0);
  }
}

main();
