// Reads the published Google Sheet server-side and hands the browser plain CSV.
//
// Google exposes the same tab through several endpoints and which ones answer
// depends on how the sheet was published/shared, so this tries them in order and
// returns the first that actually looks like CSV. The working source comes back
// in the X-Sheet-Source header.
//
// Vercel env vars (all optional — the current sheet is the fallback):
//   SHEET_PUBLISH_ID  the 2PACX-... id from the "Publish to web" link
//   SHEET_DOC_ID      the /d/<id>/ in the normal edit URL
//   SHEET_GID         the tab's gid (first tab = 0)

const PUBLISH_ID =
  process.env.SHEET_PUBLISH_ID ||
  "2PACX-1vRH_CceBQ0JoPCB47tr_Up3NpZ3xdXa8bbWpQJmqlsZjwBqNL5PUFsEF2DY7Zt-Iex7tJFRWlv5vU2b";
const DOC_ID =
  process.env.SHEET_DOC_ID || "1KMSB1gbex_miVM1agjj0MJAcaXxsu8j2PGVThb3wBkw";
const GID = process.env.SHEET_GID || "0";

const looksLikeHtml = (t) => /^\s*<(!doctype|html|meta)/i.test(t);
const hasHeaders = (t) => /khetra/i.test(t) && /status/i.test(t);  // "Select the Khetra", "Select the current status"

function tableToCsv(html) {
  // pubhtml → csv, first <table> only
  const table = (html.match(/<table[\s\S]*?<\/table>/i) || [""])[0];
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rows
    .map((tr) =>
      (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
        .map((td) =>
          td
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim()
        )
        .map((v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v))
        .join(",")
    )
    .filter((line) => line.replace(/,/g, "").trim() !== "")
    .join("\n");
}

const dataRows = (csv) =>
  csv.split(/\r?\n/).slice(1).filter((l) => l.replace(/[",\s]/g, "") !== "").length;

export default async function handler(req, res) {
  const bust = Date.now();
  // live sources first: they read the sheet as it is now. The published copy is a
  // snapshot Google refreshes every few minutes, so it can miss a row Zoho just wrote.
  const sources = [
    { name: "live-gviz",     url: `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&gid=${GID}&r=${bust}` },
    { name: "live-export",   url: `https://docs.google.com/spreadsheets/d/${DOC_ID}/export?format=csv&gid=${GID}&r=${bust}` },
    { name: "published-csv", url: `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pub?gid=${GID}&single=true&output=csv&r=${bust}` },
    { name: "published-html",url: `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pubhtml?gid=${GID}&single=true&r=${bust}`, html: true },
  ];

  const tried = [];
  let best = null;

  await Promise.all(sources.map(async (src, order) => {
    try {
      const r = await fetch(src.url, { redirect: "follow", cache: "no-store" });
      if (!r.ok) { tried.push(`${src.name}:${r.status}`); return; }
      let body = await r.text();
      if (src.html) body = tableToCsv(body);
      else if (looksLikeHtml(body)) { tried.push(`${src.name}:login-page`); return; }
      if (!hasHeaders(body)) { tried.push(`${src.name}:no-headers`); return; }
      const rows = dataRows(body);
      tried.push(`${src.name}:${rows} rows`);
      // most rows wins; on a tie the earlier (live) source wins
      if (!best || rows > best.rows || (rows === best.rows && order < best.order))
        best = { body, rows, order, name: src.name };
    } catch (e) {
      tried.push(`${src.name}:error`);
    }
  }));

  res.setHeader("X-Sheet-Tried", tried.join(" | ") || "none");
  if (!best) { res.status(502).send("No source returned usable sheet data"); return; }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Sheet-Source", best.name);
  res.setHeader("X-Sheet-Rows", String(best.rows));
  res.status(200).send(best.body);
}
