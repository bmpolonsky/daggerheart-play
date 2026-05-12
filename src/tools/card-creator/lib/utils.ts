export function cn(...inputs: unknown[]) {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
      continue;
    }

    if (typeof input === "object" && "toString" in input) {
      const value = String(input);
      if (value && value !== "[object Object]") {
        classes.push(value);
      }
    }
  }

  return classes.join(" ");
}
