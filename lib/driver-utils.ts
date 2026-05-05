export function suggestDriverId(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? name.trim();
  return `${first}742`;
}
