import Link from "next/link";
import { PublicHeader } from "@/components/brand";

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <section className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-3 text-muted">The page you are looking for does not exist.</p>
          <Link href="/" className="mt-6 inline-block font-medium text-accent underline">
            Go to the home page
          </Link>
        </section>
      </main>
    </>
  );
}
