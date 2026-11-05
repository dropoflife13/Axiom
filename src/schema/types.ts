export type VerificationKind = 'agent' | 'domain' | 'candidate';

export interface VerificationIssue {
  code: string;
  line: number;
  detail: string;
}

export interface VerificationWarning {
  code: string;
  line: number;
  detail: string;
}

export interface VerificationResult {
  verdict: 'PASS' | 'FAIL';
  errors: VerificationIssue[];
  warnings: VerificationWarning[];
}

export interface VaultRuleLocation {
  id: string;
  file: string;
  line: number;
  prefix: string;
}

export interface VerificationContext {
  vaultIndex: Map<string, VaultRuleLocation>;
  repoRoot?: string;
}

