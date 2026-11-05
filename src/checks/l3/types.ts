export interface L3CheckIssue {
  code: string;
  detail: string;
}

export interface CheckResult {
  code: string;
  verdict: 'PASS' | 'FAIL';
  errors: L3CheckIssue[];
}
