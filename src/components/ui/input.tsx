import { cloneElement, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg bg-surface-2 px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle outline-none transition-[box-shadow] duration-150 focus:ring-2 focus:ring-ring/60",
        className,
      )}
      {...props}
    />
  );
}

/** Numeric field: a displayed 0 is cleared so typing 15 never becomes 015. */
export function NumberInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (n: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    if (!focused) setRaw(value === 0 ? "" : String(value));
  }, [value, focused]);

  function parseDigits(s: string) {
    return s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className={className}
      placeholder={props.placeholder ?? "0"}
      value={focused ? raw : value === 0 ? "" : String(value)}
      onFocus={(e) => {
        setFocused(true);
        const next = value === 0 ? "" : String(value);
        setRaw(next);
        requestAnimationFrame(() => e.currentTarget.select());
      }}
      onChange={(e) => {
        const next = parseDigits(e.target.value);
        setRaw(next);
        onValueChange(next === "" ? 0 : Number(next));
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle outline-none transition-[box-shadow] duration-150 focus:ring-2 focus:ring-ring/60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-medium tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const child =
    isValidElement(children) && !(children.props as { id?: string }).id
      ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
      : children;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {child}
    </div>
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-lg bg-surface-2 px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none transition-[box-shadow] duration-150 focus:ring-2 focus:ring-ring/60",
        className,
      )}
      {...props}
    />
  );
}
