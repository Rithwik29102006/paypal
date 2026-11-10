"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DEMO_PRODUCTS, DemoProduct } from "@/lib/products";
import { formatCurrency } from "@/lib/utils";
import type { Category } from "@mandate/shared";
import {
  ShoppingBag,
  Search,
  ShieldAlert,
  Star,
  ExternalLink,
  Tag,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

const CATEGORIES: Array<{ label: string; value: string }> = [
  { label: "All Items", value: "all" },
  { label: "Groceries", value: "groceries" },
  { label: "School Supplies", value: "school" },
  { label: "Household", value: "household" },
  { label: "Electronics", value: "electronics" },
  { label: "Gift Cards", value: "gift_cards" },
];

export default function StoreCatalogPage() {
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyPoisoned, setOnlyPoisoned] = useState(false);

  const filtered = DEMO_PRODUCTS.filter((p) => {
    if (onlyPoisoned && !p.poisoned) return false;
    if (selectedCat !== "all" && p.category !== selectedCat) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Demo Merchant Store
            </h1>
            <p className="text-xs text-slate-500">
              25 catalog items browseable by the AI shopping agent. Three pages carry hidden prompt injection attacks.
            </p>
          </div>
        </div>

        {/* Poisoned Attack Filter Toggle */}
        <button
          onClick={() => setOnlyPoisoned(!onlyPoisoned)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
            onlyPoisoned
              ? "bg-rose-50 border-rose-300 text-rose-700 shadow-sm"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ShieldAlert className={`w-4 h-4 ${onlyPoisoned ? "text-rose-600" : "text-slate-400"}`} />
          <span>{onlyPoisoned ? "Showing Attack Pages (3)" : "Filter Attack Pages"}</span>
        </button>
      </div>

      {/* Attack Callout Banner for judges/demo */}
      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            <strong>Demo Attack Notice:</strong> Click on <strong>SCH-BUNDLE</strong>,{" "}
            <strong>GRO-MILK2</strong>, or <strong>SCH-NOTEBOOK-5</strong> to test the "Reveal Hidden Text" toggle!
          </span>
        </div>
        <span className="text-[11px] font-mono text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded">
          Red-Team Validated
        </span>
      </div>

      {/* Search and Category Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCat(cat.value)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedCat === cat.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
          />
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((prod) => {
          const isPoisoned = Boolean(prod.poisoned);

          return (
            <Link
              key={prod.sku}
              href={`/store/p/${prod.sku}`}
              className="bg-white rounded-2xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all p-5 flex flex-col justify-between group"
            >
              <div>
                {/* Badges Row */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                    {prod.sku}
                  </span>
                  {isPoisoned && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-600" />
                      Attack Page
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-slate-800 text-sm group-hover:text-brand-600 transition-colors line-clamp-2">
                  {prod.name}
                </h3>

                <p className="text-[11px] text-slate-400 capitalize mt-1">
                  Category: {prod.category.replace("_", " ")} · {prod.merchant}
                </p>

                {/* Safe preview snippet */}
                <p className="text-xs text-slate-600 mt-2.5 line-clamp-2">
                  {prod.description.replace(/<[^>]*>?/gm, "").slice(0, 90)}...
                </p>
              </div>

              {/* Bottom Row: Price & Reviews */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold font-mono text-slate-900">
                    {formatCurrency(prod.price)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{prod.reviews.length} reviews</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
