import Link from "next/link";

export default function PayPalCancelPage() {
  return (
    <div className="mx-auto mt-6 max-w-[560px] rounded-[26px] bg-white p-8 text-center sm:p-10">
      <h1 className="text-[2rem] font-extrabold leading-tight">You left PayPal before finishing</h1>
      <p className="mx-auto mt-3 max-w-[44ch] text-[1.05rem] text-ink-600">
        Nothing was charged. Until a PayPal account is saved, each purchase asks you to approve it in PayPal.
      </p>
      <div className="mt-7 flex justify-center gap-2">
        <Link href="/" className="btn-pp">Back to the agent</Link>
        <Link href="/mandate" className="btn-ghost">Rules</Link>
      </div>
    </div>
  );
}
