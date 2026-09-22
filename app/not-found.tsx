import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl pt-24 text-center">
      <p className="eyebrow mb-3">404</p>
      <h1 className="font-serif text-3xl text-ink">Nothing here</h1>
      <p className="mt-4 text-ink-2">
        <Link href="/" className="link">
          Back to search
        </Link>
      </p>
    </div>
  );
}
