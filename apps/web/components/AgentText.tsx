import React from "react";

/**
 * Renders the agent's reply: **bold**, "- " bullets and paragraphs.
 * PayPal checkout links are dropped because the reply shows a proper button.
 */
export function AgentText({ text }: { text: string }) {
  const cleaned = text
    .replace(/https?:\/\/\S*paypal\.com\S*/gi, "")
    .replace(/\s+here:\s*/gi, ". ") // "approve it here: <link>" -> the button below does that
    .replace(/\s+-\s+(?=\*\*|[A-Z])/g, "\n- ") // inline " - item" lists become real bullets
    .replace(/\n-\s+(\*\*Total)/g, "\n$1") // the total is not a cart line
    .replace(/(\*\*Total:?[^*]*\*\*(?:\s*\$[\d.,]+)?)\s*/g, "\n$1\n")
    .replace(/\.\s*\./g, ".");

  const inline = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${key}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>
      )
    );

  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${k}`} className="my-2 space-y-1 pl-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-sky" />
              <span>{inline(b, `b${k}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  cleaned.split(/\n+/).forEach((raw, k) => {
    const line = raw.trim();
    if (!line) return;
    if (/^[-•*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•*]\s+/, ""));
      return;
    }
    flush(k);
    blocks.push(
      <p key={`p-${k}`} className="my-1.5">
        {inline(line.replace(/\s+:\s*$/, ":"), `p${k}`)}
      </p>
    );
  });
  flush(9999);

  return <div className="text-[1.02rem] leading-relaxed text-ink-600">{blocks}</div>;
}
