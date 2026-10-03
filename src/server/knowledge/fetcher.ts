import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { childLogger } from "@/lib/logger";

const log = childLogger("knowledge.fetcher");

export type FetchedPage = {
  title: string | null;
  text: string;
  mode: "STATIC" | "RENDERED";
  finalUrl: string;
};

export class FetchError extends Error {}

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 60_000;
/** Below this much text a static fetch is assumed to be an empty JS shell. */
const MIN_STATIC_TEXT = 300;
const UA = "Mozilla/5.0 (compatible; LakiPHKnowledgeBot/1.0)";

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd"))
    return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip.replace(/^::ffff:/, ""));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * SSRF guard: http(s) only, same host as the source, and never a private/loopback address.
 * Only admins can add URLs, but the server still must not be usable to probe internal services.
 */
export async function assertAllowedUrl(url: string, baseUrl: string): Promise<URL> {
  let u: URL;
  let base: URL;
  try {
    u = new URL(url);
    base = new URL(baseUrl);
  } catch {
    throw new FetchError("Invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol))
    throw new FetchError("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new FetchError("URLs with credentials are not allowed");
  const strip = (h: string) => h.replace(/^www\./, "");
  if (strip(u.hostname) !== strip(base.hostname)) {
    throw new FetchError(`URL must be on ${base.hostname}`);
  }
  if (u.hostname === "localhost" || u.hostname.endsWith(".local"))
    throw new FetchError("Blocked host");
  const addrs = isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new FetchError("Host could not be resolved");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new FetchError("Blocked host");
  return u;
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  $("script, style, noscript, svg, iframe, template").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article").append("\n");
  const text = $("body")
    .text()
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text: text.slice(0, MAX_TEXT) };
}

async function fetchStatic(
  url: URL,
): Promise<{ title: string | null; text: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new FetchError(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(type))
    throw new FetchError(`Not an HTML page (${type || "unknown"})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new FetchError("Page is too large");
  return { ...htmlToText(new TextDecoder().decode(buf)), finalUrl: res.url };
}

/** One browser at a time: rendering is heavy and the machine is shared with the dashboard. */
let renderChain: Promise<unknown> = Promise.resolve();

async function renderWithBrowser(
  url: URL,
): Promise<{ title: string | null; text: string; finalUrl: string }> {
  const job = renderChain.then(async () => {
    const { chromium } = await import("playwright");
    const preferred = process.env.BROWSER_CHANNEL;
    const attempts: (string | undefined)[] = preferred
      ? [preferred]
      : ["msedge", "chrome", undefined];
    let lastErr: unknown;
    for (const channel of attempts) {
      let browser;
      try {
        browser = await chromium.launch({ channel, headless: true });
        const page = await browser.newPage({ userAgent: UA });
        // Skip heavy assets; we only need text.
        await page.route("**/*", (route) =>
          ["image", "media", "font"].includes(route.request().resourceType())
            ? route.abort()
            : route.continue(),
        );
        await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(2500);
        const title = (await page.title()) || null;
        const text = (await page.evaluate(() => document.body.innerText))
          .replace(/[ \t ]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, MAX_TEXT);
        return { title, text, finalUrl: page.url() };
      } catch (err) {
        lastErr = err;
        log.warn(
          { channel: channel ?? "bundled", err: (err as Error).message.split("\n")[0] },
          "browser launch/render failed",
        );
      } finally {
        await browser?.close().catch(() => undefined);
      }
    }
    throw new FetchError(
      `Could not render this page with a headless browser (${(lastErr as Error)?.message?.split("\n")[0] ?? "no browser found"}). Install Edge/Chrome or paste the page text manually.`,
    );
  });
  renderChain = job.catch(() => undefined);
  return job;
}

/**
 * Fetches a page's visible text. Tries a plain request first; if the page is an empty
 * JavaScript shell, renders it in a headless browser.
 */
export async function fetchPageText(url: string, baseUrl: string): Promise<FetchedPage> {
  const allowed = await assertAllowedUrl(url, baseUrl);
  let staticResult: Awaited<ReturnType<typeof fetchStatic>> | null = null;
  try {
    staticResult = await fetchStatic(allowed);
    if (staticResult.text.length >= MIN_STATIC_TEXT) {
      await assertAllowedUrl(staticResult.finalUrl, baseUrl);
      return { ...staticResult, mode: "STATIC" };
    }
  } catch (err) {
    log.info({ err: (err as Error).message }, "static fetch failed; trying browser render");
  }
  const rendered = await renderWithBrowser(allowed);
  await assertAllowedUrl(rendered.finalUrl, baseUrl);
  if (rendered.text.length < 50) throw new FetchError("The page has no readable text");
  return { ...rendered, mode: "RENDERED" };
}
