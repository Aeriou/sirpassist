import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
      {...props}
    />
  );
}
