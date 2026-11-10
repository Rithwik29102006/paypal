/**
 * Demo store. In production the agent would browse real merchant sites; for
 * the hackathon we ship 25 products, three of which carry hidden attacks.
 *
 * Member 3 renders the same JSON in the web app (/store, /store/p/[sku]) so
 * the attacks are visible in the demo video.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Category } from "@mandate/shared";

export interface Product {
  sku: string;
  name: string;
  category: Category;
  price: number;
  merchant: string;
  description: string;
  reviews: string[];
  /** Present only on attack pages: hidden-css | zero-width | fake-review */
  poisoned?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const products: Product[] = JSON.parse(
  readFileSync(join(here, "../store/products.json"), "utf8"),
);

export const STORE_BASE_URL =
  process.env.STORE_BASE_URL ?? "https://mandate-demo.store";

export function allProducts(): Product[] {
  return products;
}

export function pageUrl(sku: string): string {
  return `${STORE_BASE_URL}/p/${sku}`;
}

/** Simple keyword search over name, category and description. */
export function searchProducts(query: string, limit = 8): Product[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return products.slice(0, limit);

  const scored = products
    .map((p) => {
      const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.p);
}

/** True if `text` names `sku` as a whole code (SCH-NOTEBOOK is not in SCH-NOTEBOOK-5). */
export function mentionsSku(text: string, sku: string): boolean {
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(text);
}

export function getProduct(sku: string): Product | undefined {
  return products.find((p) => p.sku === sku);
}

/**
 * What a scraping agent "reads" on the product page: the raw text, including
 * anything hidden with CSS or zero-width characters. This is exactly the text
 * that must be sent to /check as `pageText`.
 */
export function pageText(p: Product): string {
  const reviews = p.reviews.length
    ? `\nReviews:\n${p.reviews.map((r) => `- ${r}`).join("\n")}`
    : "";
  return [
    `${p.name}`,
    `Price: $${p.price.toFixed(2)} | Category: ${p.category} | Sold by: ${p.merchant}`,
    `URL: ${pageUrl(p.sku)}`,
    `Description: ${p.description}`,
  ].join("\n") + reviews;
}
