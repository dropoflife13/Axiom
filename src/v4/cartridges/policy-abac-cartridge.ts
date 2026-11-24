// src/v4/cartridges/policy-abac-cartridge.ts
// Deterministic Policy-as-Code Authorization (ABAC / Cedar-style) DomainCartridge
// for Axiom-HOPE (Ablation v4). Zero LLM calls; 100% deterministic parser & oracle.

import fs from 'node:fs';
import path from 'node:path';
import {
  defaultExtractRequiredTokens,
  type CanonicalRule,
  type CanonicalRuleSet,
  type DomainCartridge,
  type OracleEvaluationResult,
} from '../domain-cartridge.js';
import type { PrerequisiteGraph } from '../prerequisite-retriever.js';

export type PolicyDecision = 'ALLOW' | 'DENY';

export interface PolicyTestVector {
  readonly id: string;
  readonly factId: string;
  readonly description: string;
  readonly principal: Readonly<Record<string, unknown>>;
  readonly action: string;
  readonly resource: Readonly<Record<string, unknown>> & { readonly type: string };
  readonly context: Readonly<Record<string, unknown>>;
  readonly expectedDecision: PolicyDecision;
}

export interface PolicyAbacTask {
  readonly id: string;
  readonly cohortId: string;
  readonly domain: 'banking' | 'healthcare' | 'admin';
  readonly title: string;
  readonly prompt: string;
  readonly boundFacts: readonly string[];
  readonly applicableFacts: readonly string[];
  readonly testVectors: readonly PolicyTestVector[];
}

export interface PolicyAbacCartridgeOptions {
  /** Workspace root directory (defaults to process.cwd()). */
  readonly rootDir?: string;
  /** Optional override path to policy-abac-tasks.json. */
  readonly tasksPath?: string;
  /** Optional prerequisite graph override (defaults to DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH). */
  readonly prerequisiteGraph?: PrerequisiteGraph;
}

interface RawPolicyTasksJson {
  readonly version: string;
  readonly domain: string;
  readonly tasks: PolicyAbacTask[];
}

// ---------------------------------------------------------------------------
// Canonical Domain Invariants (P-01 .. P-12) & Prerequisite DAG
// ---------------------------------------------------------------------------

export const POLICY_ABAC_CANONICAL_RULES: readonly CanonicalRule[] = Object.freeze([
  Object.freeze({
    id: 'P-01',
    statement:
      "Every 'permit' policy must enforce strict tenant isolation requiring principal.tenant_id == resource.tenant_id.",
    active: true,
    status: 'CONFIRMED',
    check: 'tenant-isolation',
  }),
  Object.freeze({
    id: 'P-02',
    statement:
      "Every policy bundle must include an explicit 'forbid' rule blocking all actions when principal.is_suspended == true.",
    active: true,
    status: 'CONFIRMED',
    check: 'suspended-account-forbid',
  }),
  Object.freeze({
    id: 'P-03',
    statement:
      "Write and approval policies must include an explicit 'forbid' or 'unless' guard when resource.is_locked == true.",
    active: true,
    status: 'CONFIRMED',
    check: 'locked-resource-guard',
  }),
  Object.freeze({
    id: 'P-04',
    statement:
      'Privileged actions including Action::"approve_payout", Action::"export_audit_log", and Action::"rotate_kms_key" must require context.mfa_verified == true.',
    active: true,
    status: 'CONFIRMED',
    check: 'mfa-verified',
  }),
  Object.freeze({
    id: 'P-05',
    statement:
      'Approval actions on Resource::"LedgerEntry" and Resource::"ChangeRequest" must enforce separation of duties requiring principal.id != resource.created_by.',
    active: true,
    status: 'CONFIRMED',
    check: 'separation-of-duties',
  }),
  Object.freeze({
    id: 'P-06',
    statement:
      'Payout approvals must scope Action::"approve_payout" on Resource::"LedgerEntry" to principal.role == "finance_approver" with resource.amount_cents <= 10000000.',
    active: true,
    status: 'CONFIRMED',
    check: 'payout-approval-scope',
  }),
  Object.freeze({
    id: 'P-07',
    statement:
      'Sensitive approval and key-rotation policies must require context.session_age_seconds <= 900.',
    active: true,
    status: 'CONFIRMED',
    check: 'fresh-session-window',
  }),
  Object.freeze({
    id: 'P-08',
    statement:
      'Privileged operations must require context.ip_trusted == true and context.risk_score <= 30.',
    active: true,
    status: 'CONFIRMED',
    check: 'trusted-network-risk-score',
  }),
  Object.freeze({
    id: 'P-09',
    statement:
      'Access to Action::"read_patient_record" on Resource::"PatientRecord" must require principal.role == "clinician" and resource.consent_granted == true.',
    active: true,
    status: 'CONFIRMED',
    check: 'healthcare-phi-consent',
  }),
  Object.freeze({
    id: 'P-10',
    statement:
      'Emergency Action::"break_glass_read" on Resource::"PatientRecord" must require context.break_glass_ticket != "" and context.mfa_verified == true.',
    active: true,
    status: 'CONFIRMED',
    check: 'healthcare-break-glass',
  }),
  Object.freeze({
    id: 'P-11',
    statement:
      'Policies for Action::"export_audit_log" on Resource::"AuditLog" must require principal.role == "security_auditor" and principal.clearance_level >= resource.min_clearance.',
    active: true,
    status: 'CONFIRMED',
    check: 'audit-log-export-clearance',
  }),
  Object.freeze({
    id: 'P-12',
    statement:
      'Administrative Action::"rotate_kms_key" on Resource::"KmsKey" must require principal.role == "tenant_admin" and explicit \'forbid\' when principal.is_service_account == true.',
    active: true,
    status: 'CONFIRMED',
    check: 'admin-kms-non-service-account',
  }),
]);

/**
 * Default acyclic prerequisite dependency graph linking specialized authorization rules
 * to the two universal foundational invariants: tenant isolation (`P-01`) and
 * explicit suspended-account forbid (`P-02`).
 */
export const DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH: PrerequisiteGraph = Object.freeze({
  'P-04': Object.freeze(['P-01', 'P-02']),
  'P-05': Object.freeze(['P-01', 'P-02']),
  'P-06': Object.freeze(['P-01', 'P-02']),
  'P-09': Object.freeze(['P-01', 'P-02']),
  'P-10': Object.freeze(['P-01', 'P-02']),
  'P-11': Object.freeze(['P-01', 'P-02']),
  'P-12': Object.freeze(['P-01', 'P-02']),
});

// ---------------------------------------------------------------------------
// Deterministic Cedar-Style ABAC Lexer & Recursive-Descent Parser
// ---------------------------------------------------------------------------

type TokenKind =
  | 'ident'
  | 'string'
  | 'number'
  | 'symbol'
  | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export interface ScopeConstraintAst {
  readonly kind: 'any' | 'eq' | 'in';
  readonly values: readonly string[];
}

export type PolicyExprAst =
  | { readonly type: 'literal'; readonly value: string | number | boolean | null }
  | { readonly type: 'entity'; readonly value: string }
  | { readonly type: 'path'; readonly segments: readonly string[] }
  | { readonly type: 'array'; readonly elements: readonly PolicyExprAst[] }
  | { readonly type: 'not'; readonly operand: PolicyExprAst }
  | {
      readonly type: 'binary';
      readonly op: '&&' | '||' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
      readonly left: PolicyExprAst;
      readonly right: PolicyExprAst;
    };

export interface PolicyConditionAst {
  readonly kind: 'when' | 'unless';
  readonly expr: PolicyExprAst;
}

export interface PolicyStatementAst {
  readonly id: string;
  readonly effect: 'permit' | 'forbid';
  readonly principal: ScopeConstraintAst;
  readonly action: ScopeConstraintAst;
  readonly resource: ScopeConstraintAst;
  readonly conditions: readonly PolicyConditionAst[];
}

export type ParsePolicyResult =
  | { readonly ok: true; readonly statements: readonly PolicyStatementAst[] }
  | { readonly ok: false; readonly error: string };

const TWO_CHAR_SYMBOLS = new Set(['==', '!=', '<=', '>=', '&&', '||', '::']);
const ONE_CHAR_SYMBOLS = new Set(['(', ')', '{', '}', '[', ']', ',', ';', '.', '!', '<', '>', '@']);

function tokenizePolicy(source: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (): string => {
    const ch = source[i++];
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  };

  while (i < source.length) {
    const ch = source[i];

    // Whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Line comment //
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        advance();
      }
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line;
      const startCol = col;
      advance();
      advance();
      let closed = false;
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        return {
          ok: false,
          error: `SyntaxError at ${startLine}:${startCol}: Unterminated block comment.`,
        };
      }
      continue;
    }

    const startLine = line;
    const startCol = col;

    // String literal "..."
    if (ch === '"') {
      advance();
      let str = '';
      let closed = false;
      while (i < source.length) {
        const c = advance();
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === '\\') {
          if (i >= source.length) break;
          const esc = advance();
          if (esc === 'n') str += '\n';
          else if (esc === 't') str += '\t';
          else str += esc;
        } else if (c === '\n') {
          return {
            ok: false,
            error: `SyntaxError at ${startLine}:${startCol}: Unterminated string literal.`,
          };
        } else {
          str += c;
        }
      }
      if (!closed) {
        return {
          ok: false,
          error: `SyntaxError at ${startLine}:${startCol}: Unterminated string literal.`,
        };
      }
      tokens.push({ kind: 'string', value: str, line: startLine, col: startCol });
      continue;
    }

    // Two-character symbols
    const two = source.slice(i, i + 2);
    if (TWO_CHAR_SYMBOLS.has(two)) {
      advance();
      advance();
      tokens.push({ kind: 'symbol', value: two, line: startLine, col: startCol });
      continue;
    }

    // Numeric literal (including optional leading '-' when followed by digit)
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let num = advance();
      let hasDot = false;
      while (i < source.length && (/[0-9]/.test(source[i]) || (!hasDot && source[i] === '.'))) {
        if (source[i] === '.') hasDot = true;
        num += advance();
      }
      tokens.push({ kind: 'number', value: num, line: startLine, col: startCol });
      continue;
    }

    // Single-character symbols
    if (ONE_CHAR_SYMBOLS.has(ch)) {
      advance();
      tokens.push({ kind: 'symbol', value: ch, line: startLine, col: startCol });
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        ident += advance();
      }
      tokens.push({ kind: 'ident', value: ident, line: startLine, col: startCol });
      continue;
    }

    return {
      ok: false,
      error: `SyntaxError at ${startLine}:${startCol}: Unexpected character "${ch}".`,
    };
  }

  tokens.push({ kind: 'eof', value: '', line, col });
  return { ok: true, tokens };
}

class PolicyParser {
  private pos = 0;
  private stmtCounter = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const tok = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  private expectSymbol(sym: string): Token {
    const tok = this.peek();
    if (tok.kind !== 'symbol' || tok.value !== sym) {
      throw new Error(
        `SyntaxError at ${tok.line}:${tok.col}: Expected "${sym}", found "${tok.value || 'EOF'}".`
      );
    }
    return this.next();
  }

  private expectIdent(expected?: string): Token {
    const tok = this.peek();
    if (tok.kind !== 'ident' || (expected !== undefined && tok.value !== expected)) {
      throw new Error(
        `SyntaxError at ${tok.line}:${tok.col}: Expected ${expected ? `"${expected}"` : 'identifier'}, found "${tok.value || 'EOF'}".`
      );
    }
    return this.next();
  }

  parseDocument(): PolicyStatementAst[] {
    const statements: PolicyStatementAst[] = [];
    while (this.peek().kind !== 'eof') {
      statements.push(this.parseStatement());
    }
    if (statements.length === 0) {
      throw new Error('SyntaxError: Policy document contains zero statements.');
    }
    return statements;
  }

  private parseStatement(): PolicyStatementAst {
    this.stmtCounter++;
    let id = `policy-${this.stmtCounter}`;

    // Optional @id("...") annotations
    while (this.peek().kind === 'symbol' && this.peek().value === '@') {
      this.next();
      const annName = this.expectIdent().value;
      this.expectSymbol('(');
      const valTok = this.peek();
      if (valTok.kind !== 'string') {
        throw new Error(
          `SyntaxError at ${valTok.line}:${valTok.col}: Annotation @${annName} requires a string argument.`
        );
      }
      this.next();
      this.expectSymbol(')');
      if (annName === 'id') {
        id = valTok.value;
      }
    }

    const effectTok = this.peek();
    if (effectTok.kind !== 'ident' || (effectTok.value !== 'permit' && effectTok.value !== 'forbid')) {
      throw new Error(
        `SyntaxError at ${effectTok.line}:${effectTok.col}: Expected "permit" or "forbid", found "${effectTok.value || 'EOF'}".`
      );
    }
    const effect = this.next().value as 'permit' | 'forbid';

    this.expectSymbol('(');
    const principal = this.parseScopeClause('principal');
    this.expectSymbol(',');
    const action = this.parseScopeClause('action');
    this.expectSymbol(',');
    const resource = this.parseScopeClause('resource');
    // Allow optional trailing comma inside scope tuple
    if (this.peek().kind === 'symbol' && this.peek().value === ',') {
      this.next();
    }
    this.expectSymbol(')');

    const conditions: PolicyConditionAst[] = [];
    while (
      this.peek().kind === 'ident' &&
      (this.peek().value === 'when' || this.peek().value === 'unless')
    ) {
      const kind = this.next().value as 'when' | 'unless';
      this.expectSymbol('{');
      const expr = this.parseExpr();
      this.expectSymbol('}');
      conditions.push({ kind, expr });
    }

    this.expectSymbol(';');

    return {
      id,
      effect,
      principal,
      action,
      resource,
      conditions,
    };
  }

  private parseEntityLiteral(): string {
    const ns = this.expectIdent().value;
    this.expectSymbol('::');
    const nameTok = this.peek();
    if (nameTok.kind !== 'string') {
      throw new Error(
        `SyntaxError at ${nameTok.line}:${nameTok.col}: Expected quoted entity name after "${ns}::".`
      );
    }
    this.next();
    return `${ns}::"${nameTok.value}"`;
  }

  private parseScopeClause(expectedVar: 'principal' | 'action' | 'resource'): ScopeConstraintAst {
    this.expectIdent(expectedVar);
    const nextTok = this.peek();

    if (nextTok.kind === 'symbol' && nextTok.value === '==') {
      this.next();
      const entity = this.parseEntityLiteral();
      return { kind: 'eq', values: [entity] };
    }

    if (nextTok.kind === 'ident' && nextTok.value === 'in') {
      this.next();
      if (this.peek().kind === 'symbol' && this.peek().value === '[') {
        this.next();
        const values: string[] = [];
        if (!(this.peek().kind === 'symbol' && this.peek().value === ']')) {
          values.push(this.parseEntityLiteral());
          while (this.peek().kind === 'symbol' && this.peek().value === ',') {
            this.next();
            values.push(this.parseEntityLiteral());
          }
        }
        this.expectSymbol(']');
        return { kind: 'in', values };
      }
      const single = this.parseEntityLiteral();
      return { kind: 'in', values: [single] };
    }

    return { kind: 'any', values: [] };
  }

  private parseExpr(): PolicyExprAst {
    return this.parseOr();
  }

  private parseOr(): PolicyExprAst {
    let left = this.parseAnd();
    while (this.peek().kind === 'symbol' && this.peek().value === '||') {
      this.next();
      const right = this.parseAnd();
      left = { type: 'binary', op: '||', left, right };
    }
    return left;
  }

  private parseAnd(): PolicyExprAst {
    let left = this.parseNot();
    while (this.peek().kind === 'symbol' && this.peek().value === '&&') {
      this.next();
      const right = this.parseNot();
      left = { type: 'binary', op: '&&', left, right };
    }
    return left;
  }

  private parseNot(): PolicyExprAst {
    if (this.peek().kind === 'symbol' && this.peek().value === '!') {
      this.next();
      return { type: 'not', operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): PolicyExprAst {
    const left = this.parsePrimary();
    const tok = this.peek();
    if (
      (tok.kind === 'symbol' &&
        (tok.value === '==' ||
          tok.value === '!=' ||
          tok.value === '<' ||
          tok.value === '<=' ||
          tok.value === '>' ||
          tok.value === '>=')) ||
      (tok.kind === 'ident' && tok.value === 'in')
    ) {
      const op = this.next().value as '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
      const right = this.parsePrimary();
      return { type: 'binary', op, left, right };
    }
    return left;
  }

  private parsePrimary(): PolicyExprAst {
    const tok = this.peek();

    if (tok.kind === 'symbol' && tok.value === '(') {
      this.next();
      const inner = this.parseExpr();
      this.expectSymbol(')');
      return inner;
    }

    if (tok.kind === 'symbol' && tok.value === '[') {
      this.next();
      const elements: PolicyExprAst[] = [];
      if (!(this.peek().kind === 'symbol' && this.peek().value === ']')) {
        elements.push(this.parsePrimary());
        while (this.peek().kind === 'symbol' && this.peek().value === ',') {
          this.next();
          elements.push(this.parsePrimary());
        }
      }
      this.expectSymbol(']');
      return { type: 'array', elements };
    }

    if (tok.kind === 'string') {
      this.next();
      return { type: 'literal', value: tok.value };
    }

    if (tok.kind === 'number') {
      this.next();
      return { type: 'literal', value: Number(tok.value) };
    }

    if (tok.kind === 'ident') {
      if (tok.value === 'true') {
        this.next();
        return { type: 'literal', value: true };
      }
      if (tok.value === 'false') {
        this.next();
        return { type: 'literal', value: false };
      }
      if (tok.value === 'null') {
        this.next();
        return { type: 'literal', value: null };
      }

      // Entity literal Namespace::"Name"
      if (this.peek(1).kind === 'symbol' && this.peek(1).value === '::') {
        return { type: 'entity', value: this.parseEntityLiteral() };
      }

      // Attribute path: principal.tenant_id, context.mfa_verified, etc.
      const segments: string[] = [this.next().value];
      while (this.peek().kind === 'symbol' && this.peek().value === '.') {
        this.next();
        segments.push(this.expectIdent().value);
      }
      return { type: 'path', segments };
    }

    throw new Error(
      `SyntaxError at ${tok.line}:${tok.col}: Unexpected token "${tok.value || 'EOF'}" in expression.`
    );
  }
}

/**
 * Deterministically parses a Cedar-style ABAC policy document into an AST.
 */
export function parsePolicyDocument(source: string): ParsePolicyResult {
  if (!source || source.trim().length === 0) {
    return { ok: false, error: 'SyntaxError: Policy document is empty.' };
  }
  const lexed = tokenizePolicy(source);
  if (!lexed.ok) {
    return lexed;
  }
  try {
    const parser = new PolicyParser(lexed.tokens);
    const statements = parser.parseDocument();
    return { ok: true, statements };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Deterministic Cedar-Style Evaluation Engine
// ---------------------------------------------------------------------------

class PolicyEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyEvalError';
  }
}

function matchesScope(
  constraint: ScopeConstraintAst,
  candidates: readonly string[]
): boolean {
  if (constraint.kind === 'any') return true;
  return constraint.values.some((target) => candidates.includes(target));
}

function evalExpr(expr: PolicyExprAst, vector: PolicyTestVector): unknown {
  switch (expr.type) {
    case 'literal':
    case 'entity':
      return expr.value;

    case 'array':
      return expr.elements.map((el) => evalExpr(el, vector));

    case 'path': {
      const [root, ...rest] = expr.segments;
      let current: unknown;
      if (root === 'principal') current = vector.principal;
      else if (root === 'resource') current = vector.resource;
      else if (root === 'context') current = vector.context;
      else if (root === 'action') current = vector.action;
      else {
        throw new PolicyEvalError(`Unknown root identifier "${root}".`);
      }

      for (const prop of rest) {
        if (
          current === null ||
          typeof current !== 'object' ||
          !Object.prototype.hasOwnProperty.call(current, prop)
        ) {
          throw new PolicyEvalError(`Unknown attribute "${expr.segments.join('.')}".`);
        }
        current = (current as Record<string, unknown>)[prop];
      }
      return current;
    }

    case 'not': {
      const val = evalExpr(expr.operand, vector);
      if (typeof val !== 'boolean') {
        throw new PolicyEvalError(`Logical NOT requires boolean operand (got ${typeof val}).`);
      }
      return !val;
    }

    case 'binary': {
      if (expr.op === '&&') {
        const l = evalExpr(expr.left, vector);
        if (typeof l !== 'boolean') {
          throw new PolicyEvalError(`Logical AND requires boolean left operand.`);
        }
        if (!l) return false;
        const r = evalExpr(expr.right, vector);
        if (typeof r !== 'boolean') {
          throw new PolicyEvalError(`Logical AND requires boolean right operand.`);
        }
        return r;
      }
      if (expr.op === '||') {
        const l = evalExpr(expr.left, vector);
        if (typeof l !== 'boolean') {
          throw new PolicyEvalError(`Logical OR requires boolean left operand.`);
        }
        if (l) return true;
        const r = evalExpr(expr.right, vector);
        if (typeof r !== 'boolean') {
          throw new PolicyEvalError(`Logical OR requires boolean right operand.`);
        }
        return r;
      }

      const left = evalExpr(expr.left, vector);
      const right = evalExpr(expr.right, vector);

      switch (expr.op) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '<':
        case '<=':
        case '>':
        case '>=': {
          if (typeof left !== 'number' || typeof right !== 'number') {
            throw new PolicyEvalError(
              `Operator "${expr.op}" requires numeric operands (got ${typeof left}, ${typeof right}).`
            );
          }
          if (expr.op === '<') return left < right;
          if (expr.op === '<=') return left <= right;
          if (expr.op === '>') return left > right;
          return left >= right;
        }
        case 'in': {
          if (Array.isArray(right)) {
            return right.includes(left);
          }
          throw new PolicyEvalError('Operator "in" requires an array right-hand operand.');
        }
      }
    }
  }
}

export interface VectorEvaluationOutcome {
  readonly decision: PolicyDecision;
  readonly matchedPermitIds: readonly string[];
  readonly matchedForbidIds: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Evaluates a parsed policy bundle against a single access-control vector under
 * Cedar explicit-forbid-overrides-permit, default-deny, ignore-on-error semantics.
 */
export function evaluatePolicyStatements(
  statements: readonly PolicyStatementAst[],
  vector: PolicyTestVector
): VectorEvaluationOutcome {
  const matchedPermitIds: string[] = [];
  const matchedForbidIds: string[] = [];
  const errors: string[] = [];

  const principalCandidates = [
    String(vector.principal.id ?? ''),
    `Principal::"${String(vector.principal.id ?? '')}"`,
    ...(vector.principal.role ? [`Role::"${String(vector.principal.role)}"`] : []),
  ];
  const actionCandidates = [vector.action];
  const resourceCandidates = [
    vector.resource.type,
    ...(vector.resource.id ? [String(vector.resource.id)] : []),
  ];

  for (const stmt of statements) {
    if (!matchesScope(stmt.principal, principalCandidates)) continue;
    if (!matchesScope(stmt.action, actionCandidates)) continue;
    if (!matchesScope(stmt.resource, resourceCandidates)) continue;

    let satisfied = true;
    let errored = false;

    for (const cond of stmt.conditions) {
      try {
        const res = evalExpr(cond.expr, vector);
        if (typeof res !== 'boolean') {
          errors.push(
            `[${stmt.id}] Condition "${cond.kind}" did not evaluate to boolean (got ${typeof res}).`
          );
          errored = true;
          break;
        }
        if (cond.kind === 'when' && !res) {
          satisfied = false;
          break;
        }
        if (cond.kind === 'unless' && res) {
          satisfied = false;
          break;
        }
      } catch (err) {
        errors.push(
          `[${stmt.id}] ${err instanceof Error ? err.message : String(err)}`
        );
        errored = true;
        break;
      }
    }

    if (errored || !satisfied) continue;

    if (stmt.effect === 'forbid') {
      matchedForbidIds.push(stmt.id);
    } else {
      matchedPermitIds.push(stmt.id);
    }
  }

  const decision: PolicyDecision =
    matchedForbidIds.length > 0
      ? 'DENY'
      : matchedPermitIds.length > 0
        ? 'ALLOW'
        : 'DENY';

  return {
    decision,
    matchedPermitIds,
    matchedForbidIds,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Static Forensic Classifier (Zero-LLM)
// ---------------------------------------------------------------------------

function stripComments(policyText: string): string {
  return policyText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\r\n]*/g, ' ');
}

export function classifyPolicyForensics(
  task: PolicyAbacTask,
  policyText: string
): Record<string, boolean> {
  const parsed = parsePolicyDocument(policyText);
  const code = stripComments(policyText);
  const bound = new Set(task.boundFacts);

  const hasTenantIsolation =
    /\bprincipal\.tenant_id\s*==\s*resource\.tenant_id\b/.test(code) ||
    /\bresource\.tenant_id\s*==\s*principal\.tenant_id\b/.test(code);

  const hasForbidSuspended =
    /\bforbid\s*\([\s\S]*?when\s*\{[\s\S]*?\bprincipal\.is_suspended\s*==\s*true\b[\s\S]*?\}\s*;/.test(
      code
    );

  const hasCanonicalMfa = /\bcontext\.mfa_verified\b/.test(code);
  const hasParaphrasedMfa =
    /\bcontext\.(?:two_factor|2fa|mfa_passed|mfa_enabled|has_mfa|multi_factor|otp_verified|is_mfa)\b/i.test(
      code
    ) ||
    /\bprincipal\.(?:mfa_verified|two_factor|has_mfa)\b/i.test(code);

  const hasSeparationOfDuties =
    /\bprincipal\.id\s*!=\s*resource\.created_by\b/.test(code) ||
    /\bresource\.created_by\s*!=\s*principal\.id\b/.test(code);

  const hasLockedGuard = /\bresource\.is_locked\b/.test(code);
  const hasSessionFreshness = /\bcontext\.session_age_seconds\b/.test(code);
  const hasNetworkRiskGuard =
    /\bcontext\.ip_trusted\b/.test(code) && /\bcontext\.risk_score\b/.test(code);
  const hasServiceAccountForbid =
    /\bforbid\s*\([\s\S]*?when\s*\{[\s\S]*?\bprincipal\.is_service_account\s*==\s*true\b[\s\S]*?\}\s*;/.test(
      code
    );

  return {
    syntaxError: !parsed.ok,
    missingTenantIsolation: bound.has('P-01') && !hasTenantIsolation,
    missingForbidSuspended: bound.has('P-02') && !hasForbidSuspended,
    paraphrasedMfaClaim: (bound.has('P-04') || bound.has('P-10')) && !hasCanonicalMfa && hasParaphrasedMfa,
    missingMfaRequirement: (bound.has('P-04') || bound.has('P-10')) && !hasCanonicalMfa,
    missingSeparationOfDuties: bound.has('P-05') && !hasSeparationOfDuties,
    missingLockedResourceGuard: bound.has('P-03') && !hasLockedGuard,
    missingSessionFreshnessGuard: bound.has('P-07') && !hasSessionFreshness,
    missingNetworkRiskGuard: bound.has('P-08') && !hasNetworkRiskGuard,
    missingServiceAccountForbid: bound.has('P-12') && !hasServiceAccountForbid,
  };
}

// ---------------------------------------------------------------------------
// PolicyAbacCartridge Implementation (DomainCartridge<PolicyAbacTask, string>)
// ---------------------------------------------------------------------------

export class PolicyAbacCartridge implements DomainCartridge<PolicyAbacTask, string> {
  readonly id = 'policy-abac-v4';
  readonly name = 'Policy-as-Code Authorization (Cedar-Style ABAC)';
  readonly version = '4.0.0-abac';

  private readonly tasksFilePath: string;
  private readonly prerequisiteGraph: PrerequisiteGraph;

  constructor(options: PolicyAbacCartridgeOptions = {}) {
    const rootDir = path.resolve(options.rootDir ?? '.');
    this.tasksFilePath = options.tasksPath
      ? path.resolve(options.tasksPath)
      : path.join(rootDir, 'fixtures', 'v4', 'policy-abac-tasks.json');
    this.prerequisiteGraph =
      options.prerequisiteGraph ?? DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH;
  }

  loadTasks(): PolicyAbacTask[] {
    const raw = JSON.parse(
      fs.readFileSync(this.tasksFilePath, 'utf8')
    ) as RawPolicyTasksJson;
    return (raw.tasks ?? []).map((t) => ({
      ...t,
      boundFacts: [...t.boundFacts],
      applicableFacts: [...t.applicableFacts],
      testVectors: t.testVectors.map((v) => ({
        ...v,
        principal: { ...v.principal },
        resource: { ...v.resource },
        context: { ...v.context },
      })),
    }));
  }

  loadCanonicalRules(): CanonicalRuleSet {
    const rules: CanonicalRule[] = POLICY_ABAC_CANONICAL_RULES.map((base) => {
      const withPrereqs: CanonicalRule = {
        ...base,
        prerequisites: this.prerequisiteGraph[base.id]
          ? [...this.prerequisiteGraph[base.id]]
          : undefined,
      };
      return {
        ...withPrereqs,
        requiredTokens: this.extractRequiredTokens(withPrereqs),
      };
    });

    return {
      version: this.version,
      rules,
      prerequisiteGraph: this.prerequisiteGraph,
    };
  }

  extractRequiredTokens(rule: CanonicalRule, stderrHint?: string): string[] {
    return defaultExtractRequiredTokens(rule, stderrHint);
  }

  evaluate(task: PolicyAbacTask, artifact: string): OracleEvaluationResult {
    const boundFacts = [...task.boundFacts];
    const parsed = parsePolicyDocument(artifact);

    if (!parsed.ok) {
      return {
        committed: false,
        boundFacts,
        passedFacts: [],
        failedFacts: [...boundFacts],
        stderr: parsed.error,
      };
    }

    const failedSet = new Set<string>();
    const diagnostics: string[] = [];

    for (const vector of task.testVectors) {
      const outcome = evaluatePolicyStatements(parsed.statements, vector);

      for (const evalErr of outcome.errors) {
        diagnostics.push(`[${vector.id}] ${evalErr}`);
      }

      if (outcome.decision !== vector.expectedDecision) {
        failedSet.add(vector.factId);
        diagnostics.push(
          `${vector.factId} (${vector.id}): expected ${vector.expectedDecision}, got ${outcome.decision} — ${vector.description}`
        );
        continue;
      }

      // Explicit `forbid` precedence enforcement for P-02 (suspended principal) and P-12 (service account)
      if (
        vector.factId === 'P-02' &&
        vector.expectedDecision === 'DENY' &&
        vector.principal.is_suspended === true &&
        outcome.matchedForbidIds.length === 0
      ) {
        failedSet.add('P-02');
        diagnostics.push(
          `P-02 (${vector.id}): suspended principal was denied only by default-deny without an explicit 'forbid' rule matching principal.is_suspended == true.`
        );
      }

      if (
        vector.factId === 'P-12' &&
        vector.expectedDecision === 'DENY' &&
        vector.principal.is_service_account === true &&
        outcome.matchedForbidIds.length === 0
      ) {
        failedSet.add('P-12');
        diagnostics.push(
          `P-12 (${vector.id}): service account was denied only by default-deny without an explicit 'forbid' rule matching principal.is_service_account == true.`
        );
      }
    }

    const passedFacts = boundFacts.filter((fid) => !failedSet.has(fid));
    const failedFacts = boundFacts.filter((fid) => failedSet.has(fid));

    return {
      committed: true,
      boundFacts,
      passedFacts,
      failedFacts,
      ...(diagnostics.length > 0 ? { stderr: diagnostics.join('\n') } : {}),
    };
  }

  classifyForensics(task: PolicyAbacTask, artifact: string): Record<string, boolean> {
    return classifyPolicyForensics(task, artifact);
  }
}
