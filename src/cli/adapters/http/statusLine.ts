// HTTP/2 carries no reason phrase, so the line ends at the code when none was sent.
export const statusLine = (status: number, statusText: string): string =>
  statusText === "" ? `status: ${status}` : `status: ${status} ${statusText}`;
