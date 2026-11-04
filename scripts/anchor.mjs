// Saves Lodestar's newest log hashes in this public repository and checks that the
// hashes saved earlier are still in the live log. Also the outside watchdog: it
// fails when the site is down or unhealthy, and GitHub emails the repository owner.
// Usage: node scripts/anchor.mjs https://getlodestar.ca [anchors-dir]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function getJson(fetchImpl, url, { tries = 3, waitMs = 20000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "lodestar-anchor" } });
      if (r.ok) return await r.json();
      last = new Error(`${url} responded ${r.status}`);
    } catch (e) { last = e; }
    if (i + 1 < tries) await new Promise((ok) => setTimeout(ok, waitMs));
  }
  throw last;
}

export function latestAnchor(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8")) : null;
}

// Pure: what's wrong between an earlier anchor and the live answer.
export function compareAnchor(prev, live) {
  const problems = [];
  for (const k of ["signals", "weekly"]) {
    const p = prev[k], l = live[k];
    if (!p || !p.lastId) continue;
    if (!l.at || l.at.hash == null) problems.push(`${k}: row ${p.lastId} from the anchor of ${prev.generatedAt} is gone`);
    else if (l.at.hash !== p.head) problems.push(`${k}: row ${p.lastId} has a different hash than the anchor of ${prev.generatedAt}`);
    if (l.rows < p.rows) problems.push(`${k}: ${l.rows} rows now, ${p.rows} in the anchor of ${prev.generatedAt}`);
  }
  return problems;
}

export async function runAnchor({ base, dir, fetchImpl = fetch, now = Date.now(), tries = 3, waitMs = 20000 }) {
  const url = base.replace(/\/+$/, "");
  const status = await getJson(fetchImpl, `${url}/api/public/status`, { tries, waitMs });
  const prev = latestAnchor(dir);
  const q = prev ? `?signalsId=${prev.signals.lastId}&weeklyId=${prev.weekly.lastId}` : "";
  const live = await getJson(fetchImpl, `${url}/api/public/anchor${q}`, { tries, waitMs });
  const problems = prev ? compareAnchor(prev, live) : [];
  let wrote = null;
  // A broken log is never written over: the last good anchor stays the newest one.
  if (!problems.length) {
    const day = new Date(now).toISOString().slice(0, 10);
    const file = path.join(dir, `${day}.json`);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      const strip = ({ at, ...rest }) => rest;
      fs.writeFileSync(file, JSON.stringify({ generatedAt: live.generatedAt, build: status.build || null, signals: strip(live.signals), weekly: strip(live.weekly) }, null, 2) + "\n");
      wrote = file;
    }
  }
  if (status.status === "down") problems.push(`status is down: ${status.checks.filter((c) => c.status === "fail").map((c) => c.id).join(", ")}`);
  return { status: status.status, problems, wrote };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2];
  if (!base) { console.error("Usage: node scripts/anchor.mjs <site url> [anchors dir]"); process.exit(2); }
  try {
    const r = await runAnchor({ base, dir: process.argv[3] || "anchors" });
    console.log(`status: ${r.status}${r.wrote ? `, saved ${r.wrote}` : ""}`);
    if (r.problems.length) { for (const p of r.problems) console.error(`PROBLEM: ${p}`); process.exit(1); }
  } catch (e) { console.error(`PROBLEM: site unreachable: ${(e && e.message) || e}`); process.exit(1); }
}
