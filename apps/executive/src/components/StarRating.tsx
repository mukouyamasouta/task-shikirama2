export function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  const stars = Array.from({ length: max }, (_, i) => (i < value ? "★" : "☆"));
  return <span className="font-mono">{stars.join("")}</span>;
}
