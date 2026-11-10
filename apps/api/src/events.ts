import type { LiveEventV2 } from "@mandate/shared";

type Subscriber = (event: LiveEventV2) => void;

const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function unsubscribe(fn: Subscriber): void {
  subscribers.delete(fn);
}

export function publish(event: LiveEventV2): void {
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.error("Error dispatching SSE event to subscriber:", err);
    }
  }
}

export function getSubscriberCount(): number {
  return subscribers.size;
}
