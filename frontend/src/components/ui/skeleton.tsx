import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer animate-shimmer rounded-md opacity-60", className)}
      {...props}
    />
  );
}

export { Skeleton };
