"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getProductBySku, DEMO_PRODUCTS } from "@/lib/products";
import { formatCurrency } from "@/lib/utils";
import { useMandate } from "@/lib/state";
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  ShoppingBag,
  Star,
  Bot,
  AlertTriangle,
  FileCode,
  Store,
  CheckCircle2,
} from "lucide-react";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sku = (params?.sku as string) || "";
  const product = getProductBySku(sku);
  const { runAgentRequest } = useMandate();

  const [revealHidden, setRevealHidden] = useState(false);
  const [showRawScraped, setShowRawScraped] = useState(false);

  if (!product) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Product Not Found</h2>
        <p className="text-xs text-slate-500">No SKU matching "{sku}" in the demo store.</p>
        <Link
          href="/store"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Store
        </Link>
      </div>
    );
  }

  const isPoisoned = Boolean(product.poisoned);

  // Raw scraped text format as computed by store.ts in apps/agent
  const rawPageText = [
    product.name,
    `Price: $${product.price.toFixed(2)} | Category: ${product.category} | Sold by: ${product.merchant}`,
    `URL: https://mandate-demo.store/p/${product.sku}`,
    `Description: ${product.description}`,
    product.reviews.length ? `\nReviews:\n${product.reviews.map((r) => `- ${r}`).join("\n")}` : "",
  ].join("\n");

  const handleAskAgent = () => {
    runAgentRequest(`Buy 1 unit of ${product.name} (sku ${product.sku})`);
    router.push("/agent");
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Back Link */}
      <Link
        href="/store"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Demo Store Catalog
      </Link>

      {/* Attack Notice Banner (if attack product) */}
      {isPoisoned && (
        <div className="p-5 bg-rose-50 border border-rose-300 rounded-2xl text-rose-950 flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm block">
                Hackathon Security Demo: Attack Page ({product.poisoned})
              </strong>
              <p className="text-xs text-rose-900 mt-0.5">
                {product.poisoned === "hidden-css" &&
                  "This page contains invisible HTML/CSS (<span style=\"display:none\">) attempting prompt injection to order 10 gift cards."}
                {product.poisoned === "zero-width" &&
                  "This page contains zero-width Unicode characters hiding an injection payload to push electronics into the cart."}
                {product.poisoned === "fake-review" &&
                  "This page features a fabricated store review threatening order cancellation unless a $240 bundle is bought."}
              </p>
            </div>
          </div>

          <button
            onClick={() => setRevealHidden(!revealHidden)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
          >
            {revealHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {revealHidden ? "Hide Injected Code" : "Reveal Hidden Text (Video Toggle)"}
          </button>
        </div>
      )}

      {/* Main Product Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Header Row */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                {product.sku}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 capitalize">
                Category: {product.category.replace("_", " ")}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              {product.name}
            </h1>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              Sold by: <span className="font-semibold text-slate-700">{product.merchant}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-3xl font-bold font-mono text-slate-900 block">
              {formatCurrency(product.price)}
            </span>
            <span className="text-[11px] text-slate-400">Available in Demo Store</span>
          </div>
        </div>

        {/* Product Description Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Product Description
            </h3>
            {isPoisoned && (
              <button
                onClick={() => setRevealHidden(!revealHidden)}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
              >
                {revealHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealHidden ? "Reset to Normal Browser View" : "Toggle Hidden Attack Visibility"}
              </button>
            )}
          </div>

          {/* Normal HTML Render vs Revealed Attack Render */}
          {revealHidden ? (
            <div className="p-4 bg-rose-50 border-2 border-dashed border-rose-300 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                REVEALED ADVERSARIAL CONTENT IN DESCRIPTION:
              </span>
              <p className="text-slate-800 leading-relaxed font-mono whitespace-pre-wrap bg-white p-3 rounded-lg border border-rose-200">
                {product.description}
              </p>
              <p className="text-[11px] text-rose-700">
                Notice: A browser user sees only standard text, but when an AI agent scrapes the DOM or HTTP body, it ingests this full text.
              </p>
            </div>
          ) : (
            <div
              className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}
        </div>

        {/* Customer Reviews Section */}
        {product.reviews.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Customer Reviews ({product.reviews.length})
            </h3>
            <div className="space-y-2.5">
              {product.reviews.map((rev, i) => {
                const isAttackReview =
                  product.poisoned === "fake-review" &&
                  rev.toLowerCase().includes("premium supply bundle");

                return (
                  <div
                    key={i}
                    className={`p-3.5 rounded-xl border text-xs ${
                      isAttackReview
                        ? "bg-rose-50 border-rose-200 text-rose-950 font-medium"
                        : "bg-slate-50 border-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {isAttackReview && (
                        <span className="ml-2 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          Poisoned Fake Review
                        </span>
                      )}
                    </div>
                    <p className="italic">"{rev}"</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => setShowRawScraped(!showRawScraped)}
            className="text-xs text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1.5"
          >
            <FileCode className="w-4 h-4 text-slate-400" />
            {showRawScraped ? "Hide Raw Agent Scrape Text" : "View Raw Page Text (Agent View)"}
          </button>

          <button
            onClick={handleAskAgent}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2"
          >
            <Bot className="w-4 h-4" />
            Ask Agent to Buy This SKU
          </button>
        </div>

        {/* Raw Scraped Text Drawer */}
        {showRawScraped && (
          <div className="pt-4 border-t border-slate-100 animate-in fade-in space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              What the agent scraping layer reads (sent to POST /check as pageText):
            </span>
            <pre className="p-4 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
              {rawPageText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
