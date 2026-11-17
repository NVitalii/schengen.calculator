#!/usr/bin/env node
// Builds every page of the site in every language.
//
//   node tool/build_pages.cjs            write the pages into the repo
//   node tool/build_pages.cjs --check    fail if the pages on disk are stale
//   node tool/build_pages.cjs --out DIR  write them somewhere else
//
// Run it through tool/build.sh, which does this in a throwaway container
// (the owner's rule: builds never run on the machine itself).
//
// What goes in:
//   src/site.json          the languages, the pages, the address of the site
//   src/pages/*.html       the templates; their text IS the English version
//   src/i18n/<code>.json   every other language: "meta" (titles and
//                          descriptions per page), "common" and one section
//                          per page (texts by the data-i18n key), "calc" (the
//                          calculator widget); en.json holds only "calc"
// What comes out:
//   index.html, schengen-calculator.html           English, at the root
//   <dir>/index.html, <dir>/schengen-calculator.html   every other language
//   sitemap.xml
//
// Why real files per language: the old pages kept both languages in one file
// and swapped the texts in the browser, so a search engine only ever saw the
// English one. A page here is plain HTML in its own language, at its own
// address, and names its siblings (rel="alternate" hreflang).
//
// No dependencies on purpose: nothing to install, and the markup is ours, so
// a small scanner that understands data-i18n is enough.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const outFlag = args.indexOf("--out");
const OUT = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : ROOT;

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const site = JSON.parse(read("src", "site.json"));
const problems = [];
const warn = (text) => console.error(`warning: ${text}`);

// ---------------------------------------------------------------- languages
const languages = site.languages.map((lang) => {
  const file = path.join(ROOT, "src", "i18n", `${lang.code}.json`);
  const data = fs.existsSync(file) ? JSON.parse(read("src", "i18n", `${lang.code}.json`)) : null;
  return { ...lang, data };
});
const english = languages.find((l) => l.code === "en");
if (!english || !english.data || !english.data.calc) throw new Error("src/i18n/en.json with a calc section is required");
const built = languages.filter((l) => l.code === "en" || l.data);
for (const l of languages) if (!l.data) warn(`${l.code}: no src/i18n/${l.code}.json — language skipped`);

// ---------------------------------------------------------------- addresses
function pagePath(lang, page) {
  const isHome = page.file === "index.html";
  if (lang.code === "en") return isHome ? "/" : `/${page.file}`;
  if (isHome) return site.directoryIndex ? `/${lang.dir}/` : `/${lang.dir}/index.html`;
  return `/${lang.dir}/${page.file}`;
}
const pageUrl = (lang, page) => site.site + pagePath(lang, page);
const outFile = (lang, page) => (lang.code === "en" ? page.file : `${lang.dir}/${page.file}`);

// ---------------------------------------------------------------- escaping
const escText = (s) => s.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const hasMarkup = (s) => /<\/?[a-zA-Z][^>]*>/.test(s);
const tagNames = (s) => (s.match(/<\/?[a-zA-Z][a-zA-Z0-9]*/g) || []).map((t) => t.toLowerCase()).sort().join(" ");

// ---------------------------------------------------------------- the scanner
// Every element that carries data-i18n="key": where its content starts and
// ends. The closing tag is found by counting nested tags of the same name.
function i18nElements(html) {
  const found = [];
  const open = /<([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*?)\sdata-i18n="([^"]+)"([^<>]*)>/g;
  let m;
  while ((m = open.exec(html))) {
    const tag = m[1];
    const start = m.index + m[0].length;
    const nested = new RegExp(`<(/?)${tag}\\b[^<>]*>`, "gi");
    nested.lastIndex = start;
    let depth = 1;
    let n;
    let end = -1;
    while ((n = nested.exec(html))) {
      if (n[1]) depth--;
      else if (!/\/>$/.test(n[0])) depth++;
      if (depth === 0) {
        end = n.index;
        break;
      }
    }
    if (end < 0) throw new Error(`no closing </${tag}> for data-i18n="${m[3]}"`);
    found.push({ key: m[3], start, end });
  }
  return found;
}

// The new content of one element. A text with tags of its own replaces the
// content whole. A plain text keeps the icon the element starts with (the
// old in-browser switch wiped those icons, which was never meant).
function newInner(old, value) {
  if (hasMarkup(value)) return value;
  const icon = old.lastIndexOf("</svg>");
  if (icon >= 0) {
    const indent = (old.slice(icon + 6).match(/^\s*/) || [""])[0];
    const tail = (old.match(/\s*$/) || [""])[0];
    return old.slice(0, icon + 6) + indent + escText(value) + tail;
  }
  return escText(value);
}

function translateBody(html, lang, page) {
  const text = (key) => {
    const own = lang.data[page.id] || {};
    const common = lang.data.common || {};
    return key in own ? own[key] : common[key];
  };
  const elements = i18nElements(html);
  const used = new Set();
  let out = "";
  let at = 0;
  for (const el of elements) {
    const value = text(el.key);
    used.add(el.key);
    if (value === undefined) {
      problems.push(`${lang.code}/${page.id}: no text for "${el.key}"`);
      continue;
    }
    const old = html.slice(el.start, el.end);
    if (hasMarkup(value) || hasMarkup(old.replace(/<svg[\s\S]*<\/svg>/, ""))) {
      const a = tagNames(old.replace(/<svg[\s\S]*<\/svg>/, ""));
      if (a !== tagNames(value)) problems.push(`${lang.code}/${page.id}: tags of "${el.key}" differ from the English text (${a || "none"} vs ${tagNames(value) || "none"})`);
    }
    out += html.slice(at, el.start) + newInner(old, value);
    at = el.end;
  }
  out += html.slice(at);

  // Attributes: data-i18n-placeholder="key" fills the tag's placeholder,
  // data-i18n-title its title.
  out = out.replace(/<[a-zA-Z][^<>]*\sdata-i18n-(?:placeholder|title)="[^"]+"[^<>]*>/g, (tag) => {
    let result = tag;
    for (const m of tag.matchAll(/\sdata-i18n-(placeholder|title)="([^"]+)"/g)) {
      const [, attr, key] = m;
      used.add(key);
      const value = text(key);
      if (value === undefined) {
        problems.push(`${lang.code}/${page.id}: no text for "${key}"`);
        continue;
      }
      const own = new RegExp(`\\s${attr}="[^"]*"`);
      if (!own.test(result)) {
        problems.push(`${lang.code}/${page.id}: "${key}" needs a ${attr} attribute to fill`);
        continue;
      }
      result = result.replace(own, ` ${attr}="${escAttr(value)}"`);
    }
    return result;
  });

  const own = lang.data[page.id] || {};
  for (const key of Object.keys(own)) if (!used.has(key)) warn(`${lang.code}/${page.id}: "${key}" is not used by the page`);
  return { html: out, used };
}

// ---------------------------------------------------------------- the head
function setMeta(html, attr, name, value) {
  const re = new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`the template has no <meta ${attr}="${name}">`);
  return html.replace(re, `$1${escAttr(value)}$2`);
}

function alternates(page) {
  const lines = built.map((l) => `    <link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l, page)}">`);
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${pageUrl(english, page)}">`);
  return lines.join("\n");
}

// English pages only: a visitor whose saved choice or browser language is
// another language of the site is taken to that version of the same page.
function suggestScript(page) {
  const dirs = {};
  for (const l of built) if (l.code !== "en") for (const code of l.browser || [l.code]) dirs[code] = pagePath(l, page);
  return [
    "    <!-- Other languages live at their own addresses. A visitor whose saved",
    "         choice or browser language is one of them is taken there; picking",
    "         English in the menu is remembered and always respected. Crawlers",
    "         carry neither, so they read this page as it is. -->",
    "    <script>",
    "        (function () {",
    "            try {",
    `                var pages = ${JSON.stringify(dirs)};`,
    "                var saved = localStorage.getItem('lang');",
    "                if (saved === 'en') return;",
    "                var want = saved || (navigator.language || '').toLowerCase().split('-')[0];",
    "                if (pages[want]) window.location.replace(pages[want] + window.location.search + window.location.hash);",
    "            } catch (e) {}",
    "        })();",
    "    </script>",
  ].join("\n");
}

function buildHead(html, lang, page) {
  const url = pageUrl(lang, page);
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang.hreflang}">`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "property", "twitter:url", url);

  if (lang.code !== "en") {
    const meta = (lang.data.meta || {})[page.id];
    if (!meta || !meta.title || !meta.description) {
      problems.push(`${lang.code}/${page.id}: meta.title and meta.description are required`);
    } else {
      const social = meta.og_description || meta.description;
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(meta.title)}</title>`);
      html = setMeta(html, "name", "description", meta.description);
      html = setMeta(html, "property", "og:title", meta.title);
      html = setMeta(html, "property", "twitter:title", meta.title);
      html = setMeta(html, "property", "og:description", social);
      html = setMeta(html, "property", "twitter:description", social);
      // The keywords tag is English search phrases; a translated page drops it
      // rather than carry phrases in the wrong language.
      html = html.replace(/\n[ \t]*<meta name="keywords" content="[^"]*">/, "");
      // Structured data: the application blocks describe THIS page.
      html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (whole, openTag, body, closeTag) => {
        const data = JSON.parse(body);
        if (data["@type"] === "SoftwareApplication" || data["@type"] === "WebApplication") {
          data.url = url;
          data.description = meta.description;
          data.inLanguage = lang.hreflang;
          if (data["@type"] === "WebApplication" && meta.app_name) data.name = meta.app_name;
          if (data.featureList) delete data.featureList; // English sentences
        } else {
          return whole; // the tutorial video is English everywhere
        }
        const json = JSON.stringify(data, null, 2).split("\n").map((line) => `    ${line}`).join("\n");
        return `${openTag}\n${json}\n    ${closeTag}`;
      });
    }
  }

  const extra = [
    alternates(page),
    `    <meta property="og:locale" content="${lang.og}">`,
    "    <!-- iPhone and iPad: Safari offers the app from the App Store -->",
    `    <meta name="apple-itunes-app" content="app-id=${site.appStoreId}">`,
  ];
  if (lang.code === "en") extra.push(suggestScript(page));
  const canonical = /(<link rel="canonical" href="[^"]*">)/;
  if (!canonical.test(html)) throw new Error("the template has no canonical link");
  return html.replace(canonical, `$1\n${extra.join("\n")}`);
}

// ---------------------------------------------------------------- the menu
function langMenu(lang, page) {
  const links = built.map((l) => {
    const active = l.code === lang.code ? ' class="active" aria-current="true"' : "";
    return `                    <a href="${pagePath(l, page)}" hreflang="${l.hreflang}" lang="${l.hreflang}" data-lang="${l.code}"${active}>${escText(l.name)}</a>`;
  });
  return [
    `<details class="lang-menu">`,
    `                <summary aria-label="Language: ${escAttr(lang.name)}"><span class="lang-code">${lang.short}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></summary>`,
    `                <div class="lang-list">`,
    ...links,
    `                </div>`,
    `            </details>`,
  ].join("\n");
}

// ---------------------------------------------------------------- the widget
function calcL10n(lang) {
  const calc = lang.data.calc;
  const reference = english.data.calc;
  for (const key of Object.keys(reference.strings)) {
    if (!(key in calc.strings)) problems.push(`${lang.code}/calc: no text for "${key}"`);
    else if (reference.strings[key].includes("{n}") !== calc.strings[key].includes("{n}")) problems.push(`${lang.code}/calc: "{n}" of "${key}" differs from the English text`);
  }
  // A counted text may have more forms than English does (Polish, Russian:
  // "trips_few" next to "trips_one" and "trips_other"); the widget picks the
  // form by the language's own plural rules.
  for (const key of Object.keys(calc.strings)) {
    if (key in reference.strings) continue;
    const form = key.match(/^(.+)_(zero|two|few|many)$/);
    const base = form && `${form[1]}_other` in reference.strings ? `${form[1]}_other` : null;
    if (!base) warn(`${lang.code}/calc: "${key}" is not used by the widget`);
    else if (reference.strings[base].includes("{n}") !== calc.strings[key].includes("{n}")) problems.push(`${lang.code}/calc: "{n}" of "${key}" differs from the English text`);
  }
  if (!Array.isArray(calc.months) || calc.months.length !== 12) problems.push(`${lang.code}/calc: 12 months are required`);
  if (!Array.isArray(calc.weekdays) || calc.weekdays.length !== 7) problems.push(`${lang.code}/calc: 7 weekdays (Monday first) are required`);
  const payload = { locale: lang.locale, months: calc.months, weekdays: calc.weekdays, strings: calc.strings };
  if (calc.monthYear) {
    // The calendar's heading, for languages that put the year first.
    if (!calc.monthYear.includes("{month}") || !calc.monthYear.includes("{year}")) problems.push(`${lang.code}/calc: monthYear needs {month} and {year}`);
    payload.monthYear = calc.monthYear;
  }
  return `<script>window.CALC_L10N = ${JSON.stringify(payload).replace(/</g, "\\u003c")};</script>`;
}

// ---------------------------------------------------------------- one page
function buildPage(lang, page) {
  let html = read("src", "pages", page.file);
  if (lang.code !== "en") html = translateBody(html, lang, page).html;
  html = buildHead(html, lang, page);
  for (const marker of ["<!-- build:lang-menu -->", "<!-- build:calc-l10n -->"]) {
    if (!html.includes(marker)) throw new Error(`${page.file}: marker ${marker} is missing`);
  }
  html = html.replace("<!-- build:lang-menu -->", langMenu(lang, page));
  html = html.replace("<!-- build:calc-l10n -->", calcL10n(lang.code === "en" ? english : lang));
  html = html.split("{{home}}").join(pagePath(lang, site.pages.find((p) => p.file === "index.html")));
  const note = `<!-- Generated by tool/build_pages.cjs from src/pages/${page.file}${lang.code === "en" ? "" : ` and src/i18n/${lang.code}.json`}. Edit those, not this file. -->`;
  html = html.replace(/^<!DOCTYPE html>\n/, `<!DOCTYPE html>\n${note}\n`);
  const left = html.match(/\{\{[a-zA-Z_]+\}\}|<!-- build:[a-z-]+ -->/);
  if (left) problems.push(`${lang.code}/${page.id}: "${left[0]}" was left in the page`);
  return html;
}

// ---------------------------------------------------------------- the sitemap
function buildSitemap() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const page of site.pages) {
    for (const lang of built) {
      lines.push("  <url>", `    <loc>${pageUrl(lang, page)}</loc>`);
      for (const other of built) lines.push(`    <xhtml:link rel="alternate" hreflang="${other.hreflang}" href="${pageUrl(other, page)}"/>`);
      lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(english, page)}"/>`);
      lines.push(`    <lastmod>${site.updated}</lastmod>`, `    <changefreq>${page.changefreq}</changefreq>`, `    <priority>${lang.code === "en" ? page.priority : page.translatedPriority}</priority>`, "  </url>");
    }
  }
  for (const extra of site.otherUrls) {
    lines.push("  <url>", `    <loc>${site.site}${extra.path}</loc>`, `    <lastmod>${extra.lastmod}</lastmod>`, `    <changefreq>${extra.changefreq}</changefreq>`, `    <priority>${extra.priority}</priority>`, "  </url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------- run
const files = new Map();
for (const page of site.pages) for (const lang of built) files.set(outFile(lang, page), buildPage(lang, page));
files.set("sitemap.xml", buildSitemap());

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

if (CHECK) {
  const stale = [];
  for (const [name, content] of files) {
    const onDisk = fs.existsSync(path.join(ROOT, name)) ? read(name) : null;
    if (onDisk !== content) stale.push(name);
  }
  if (stale.length) {
    console.error(`stale (rebuild with tool/build.sh): ${stale.join(", ")}`);
    process.exit(1);
  }
  console.error(`up to date: ${files.size} files, ${built.length} languages`);
} else {
  for (const [name, content] of files) {
    const target = path.join(OUT, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  console.error(`built ${files.size} files for ${built.length} languages (${built.map((l) => l.code).join(", ")}) into ${OUT}`);
}
