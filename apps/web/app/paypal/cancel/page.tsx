import Link from "next/link";

export default function PayPalCancelPage() {
  return (
    <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-sm">
      <h1 className="font-bold text-slate-900 text-lg">PayPal setup cancelled</h1>
      <p className="text-slate-600">
        The mandate was signed, but no PayPal account was saved. Purchases will need your approval in PayPal each time until you connect it.
      </p>
      <Link href="/mandate" className="inline-block px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Back to mandate</Link>
    </div>
  );
}
