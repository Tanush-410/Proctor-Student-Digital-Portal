/** Thrown by multer fileFilter callbacks to reject a disallowed file type with a clear message (see app.ts's error handler). */
export class InvalidFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFileTypeError";
  }
}
