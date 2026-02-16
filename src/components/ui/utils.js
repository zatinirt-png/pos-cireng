export function cx(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .map(String)
    .join(" ")
    .trim();
}
