"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Refreshes the page every 3 seconds while a document is being read.
export function Refresher() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
