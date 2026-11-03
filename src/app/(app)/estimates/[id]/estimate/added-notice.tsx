"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

// "Added 15 features, … to the request." after adding from a document, shown once: the address
// loses its notice at once, and the notice clears when Next.js hides this page.
export function AddedNotice(props: { message: string | null; requestId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(props.message);
  if (props.message && props.message !== message) setMessage(props.message);

  useEffect(() => {
    if (props.message) router.replace(`/estimates/${props.requestId}/estimate`, { scroll: false });
  }, [props.message, props.requestId, router]);

  useLayoutEffect(() => () => setMessage(null), []);

  if (!message) return null;
  return (
    <p role="status" className="rounded-lg bg-ok-bg px-3.5 py-3 text-sm text-ok">
      {message}
    </p>
  );
}
