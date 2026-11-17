/** True when two API paths address the same resource, i.e. they differ only in query parameters. */
export function sameResource(previous: string, next: string) {
  return previous.split("?")[0] === next.split("?")[0];
}
