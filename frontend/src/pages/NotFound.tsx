import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 grid-bg px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-xl">
        <Compass className="h-9 w-9" aria-hidden="true" />
      </div>
      <h1 className="font-display text-4xl font-bold tracking-tight">
        404 — <span className="text-gradient">Signal Lost</span>
      </h1>
      <p className="max-w-md text-muted-foreground md:text-base">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex h-11 items-center rounded-md bg-gradient-to-r from-violet-600 to-violet-500 px-6 text-sm font-medium text-white shadow-lg"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}