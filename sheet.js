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

export default async function handler(req, res) {
  const bust = Date.now();
  const sources = [
    {
      name: "published-csv",
      url: `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pub?gid=${GID}&single=true&output=csv&r=${bust}`,
    },
    {
      name: "gviz-csv",
      url: `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&gid=${GID}&r=${bust}`,
    },
    {
      name: "export-csv",
      url: `https://docs.google.com/spreadsheets/d/${DOC_ID}/export?format=csv&gid=${GID}&r=${bust}`,
    },
    {
      name: "pubhtml",
      url: `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pubhtml?gid=${GID}&single=true&r=${bust}`,
      html: true,
    },
  ];

  const tried = [];
  let best = null;

  for (const s of sources) {
    try {
      const r = await fetch(s.url, { redirect: "follow", cache: "no-store" });
      if (!r.ok) {
        tried.push(`${s.name}:${r.status}`);
        continue;
      }
      let body = await r.text();
      if (s.html) body = tableToCsv(body);
      else if (looksLikeHtml(body)) {
        tried.push(`${s.name}:html`);
        continue;
      }
      if (hasHeaders(body)) {
        send(res, body, s.name, tried);
        return;
      }
      tried.push(`${s.name}:no-headers`);
      if (!best && body.trim()) best = { body, name: s.name };
    } catch (e) {
      tried.push(`${s.name}:error`);
    }
  }

  if (best) {
    send(res, best.body, best.name, tried);
    return;
  }
  res.setHeader("X-Sheet-Tried", tried.join(" | "));
  res.status(502).send("No source returned usable sheet data");
}

function send(res, csv, source, tried) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Sheet-Source", source);
  res.setHeader("X-Sheet-Tried", tried.join(" | ") || "none");
  res.status(200).send(csv);
}
