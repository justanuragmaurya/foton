import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-full place-items-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Foton</h1>
        <p className="mb-8 text-lg text-ink-muted">
          Layered photo editing with GPU compositing and on-device AI. It runs in your browser, and your images stay on your machine.
        </p>
        <Link
          href="/edit"
          className="inline-flex h-11 items-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Open the editor
        </Link>
      </div>
    </main>
  );
}
