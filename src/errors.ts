export type ShareExportErrorCode =
  | 'INVALID_URL'
  | 'NOT_FOUND'
  | 'PARSE_FAILED'
  | 'FETCH_FAILED'
  | 'UNSUPPORTED_PROVIDER';

export class ShareExportError extends Error {
  readonly code: ShareExportErrorCode;

  constructor(code: ShareExportErrorCode, message = '') {
    super(message !== '' ? message : code);
    this.name = 'ShareExportError';
    this.code = code;
  }
}
