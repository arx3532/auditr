/** The server sent something that is not valid SSE or not a valid chat event. */
export class StreamProtocolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'StreamProtocolError'
    this.code = code
  }
}
