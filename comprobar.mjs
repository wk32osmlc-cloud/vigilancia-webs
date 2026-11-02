#!/usr/bin/env node
/**
 * Vigilancia 24/7 (se ejecuta en GitHub Actions, no en tu ordenador).
 * Comprueba cada web, guarda el historial de 7 días en la rama «datos» (estado.json + historial.json)
 * y abre un aviso (issue) cuando una web lleva 2 comprobaciones caída; lo cierra cuando vuelve.
 * GitHub te notifica los avisos por correo y en la app del móvil.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DATOS = process.env.VIGILANCIA_DATOS ?? join(AQUI, "datos");
const SIETE_DIAS = 7 * 864e5;

export async function comprobar(url, f = fetch) {
  for (let intento = 0; intento < 2; intento++) {
    const t0 = Date.now();
    try {
      const r = await f(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Vigilancia-PanelDeControl/1.0" } });
      if (r.status < 400) return { ok: true, codigo: r.status, ms: Date.now() - t0 };
      if (intento === 1) return { ok: false, codigo: r.status, ms: null };
    } catch {
      if (intento === 1) return { ok: false, codigo: null, ms: null };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Calcula disponibilidad e incidentes de 7 días a partir del historial de una web. */
export function resumir(historial, ahora = Date.now()) {
  const h = historial.filter((x) => ahora - Date.parse(x.t) <= SIETE_DIAS).sort((a, b) => a.t.localeCompare(b.t));
  const uptime = h.length ? Math.round((h.filter((x) => x.ok).length / h.length) * 10000) / 100 : 100;
  const incidentes = [];
  let actual = null;
  for (const x of h) {
    if (!x.ok && !actual) actual = { inicio: x.t, fin: null, minutos: 0 };
    if (x.ok && actual) {
      actual.fin = x.t;
      actual.minutos = Math.round((Date.parse(x.t) - Date.parse(actual.inicio)) / 60000);
      incidentes.push(actual);
      actual = null;
    }
  }
  if (actual) {
    actual.minutos = Math.round((ahora - Date.parse(actual.inicio)) / 60000);
    incidentes.push(actual);
  }
  return { uptime, incidentes, h };
}

async function github(ruta, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json" },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return r.json();
}

async function avisos(caidas, recuperadas) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return;
  const abiertos = await github("/issues?state=open&labels=caida&per_page=100");
  for (const w of caidas) {
    if (abiertos.some((i) => i.title.includes(w.url))) continue;
    await github("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: `🔴 Caída: ${w.nombre} (${w.url})`,
        body: `La web no responde desde ${w.caida_desde} (código: ${w.codigo ?? "sin respuesta"}).\n\nEste aviso se cerrará solo cuando vuelva a funcionar.`,
        labels: ["caida"],
      }),
    });
  }
  for (const w of recuperadas) {
    for (const i of abiertos.filter((x) => x.title.includes(w.url))) {
      await github(`/issues/${i.number}/comments`, { method: "POST", body: JSON.stringify({ body: `✅ Vuelve a funcionar (${new Date().toISOString()}).` }) });
      await github(`/issues/${i.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    }
  }
}

async function main() {
  const { webs } = JSON.parse(readFileSync(join(AQUI, "webs.json"), "utf8"));
  const rutaH = join(DATOS, "historial.json");
  const historial = existsSync(rutaH) ? JSON.parse(readFileSync(rutaH, "utf8")) : {};
  const ahora = new Date().toISOString();
  const estado = { actualizado: ahora, webs: [] };
  const caidas = [];
  const recuperadas = [];
  for (const w of webs) {
    const r = await comprobar(w.url);
    const previo = historial[w.url] ?? [];
    const lista = [...previo, { t: ahora, ok: r.ok, ms: r.ms }];
    const { uptime, incidentes, h } = resumir(lista);
    historial[w.url] = h;
    const ultimas = h.slice(-2);
    const caidaDesde = r.ok ? null : (incidentes.at(-1)?.fin === null ? incidentes.at(-1).inicio : ahora);
    estado.webs.push({ url: w.url, nombre: w.nombre, arriba: r.ok, ms: r.ms, codigo: r.codigo, caida_desde: caidaDesde, uptime_7d: uptime, incidentes_7d: incidentes });
    if (!r.ok && ultimas.length === 2 && ultimas.every((x) => !x.ok)) caidas.push({ ...w, codigo: r.codigo, caida_desde: caidaDesde });
    if (r.ok && previo.at(-1) && !previo.at(-1).ok) recuperadas.push(w);
    console.log(`${r.ok ? "OK " : "KO "} ${w.url} ${r.ms ?? "-"} ms · 7 días ${uptime} %`);
  }
  writeFileSync(rutaH, JSON.stringify(historial));
  writeFileSync(join(DATOS, "estado.json"), JSON.stringify(estado, null, 2));
  await avisos(caidas, recuperadas);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
