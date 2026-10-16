import * as fs from 'node:fs';
import * as path from 'node:path';
import MagicString from 'magic-string';
import {createFilter, parseSync} from 'vite';

/**
 * The build optimizer: rewrites that let the bundler drop Angular code an app doesn't use. A port of
 * the oxc-based pass in `@angular/build` (`src/tools/oxc/oxc-transform.js`), which the CLI runs on
 * every module when it optimizes a build:
 *
 * - Classes with static members (`ɵfac`, `ɵcmp`, `ɵprov`, ...) move into a pure IIFE, so an unused
 *   component, pipe or service disappears along with its definition.
 * - TypeScript enums become a pure IIFE that returns the enum.
 * - `ɵsetClassMetadata` and friends, inside their IIFE wrappers, become `void 0`.
 * - In side-effect-free `@angular/*` packages, every top-level call and `new` is marked pure. In
 *   other code, only `new InjectionToken(...)` is.
 * - Decorator metadata for the old `ctorParameters`/`decorators`/`propDecorators` style is removed.
 *
 * Nothing here is specific to ngp. The bundler does the actual removal: Rolldown drops a pure
 * expression whose result is unused, and its minifier drops `void 0` statements.
 */

export interface OptimizeOptions {
  /**
   * The module's package declares it free of side effects (`"sideEffects": false`). Allows marking
   * every top-level call pure in Angular's own packages, and wrapping `__decorate` calls.
   */
  sideEffectFree: boolean;
}

/** Cheap test for whether a module has anything the optimizer could rewrite. */
export const OPTIMIZER_CANDIDATE = /ɵ|InjectionToken|INJECTOR_KEY|ctorParameters|decorators|propDecorators|__decorate|__esDecorate/;

const packageSideEffects = new Map<string, ((file: string) => boolean) | null>();

/**
 * Whether the package a `node_modules` file belongs to declares the file free of side effects, with
 * `"sideEffects": false` or a list of globs that doesn't match it. Vite reads the same field when it
 * resolves a module, but doesn't pass the result to `transform`.
 */
export function isSideEffectFree(file: string): boolean {
  if (!/[\\/]node_modules[\\/]/.test(file)) {
    return false;
  }
  for (let dir = path.dirname(file); path.basename(dir) !== 'node_modules' && path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    if (!packageSideEffects.has(dir)) {
      packageSideEffects.set(dir, readSideEffects(dir));
    }
    const hasSideEffects = packageSideEffects.get(dir);
    if (hasSideEffects) {
      return !hasSideEffects(file);
    }
  }
  return false;
}

/** A package's `sideEffects` as a test for one file, or null when `dir` holds no package.json. */
function readSideEffects(dir: string): ((file: string) => boolean) | null {
  let pkg: {sideEffects?: unknown};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  if (pkg.sideEffects === false) {
    return () => false;
  }
  if (Array.isArray(pkg.sideEffects)) {
    // Like Vite and webpack: a pattern without a slash matches the file name anywhere.
    const patterns = pkg.sideEffects.map((p: string) => (p.includes('/') ? p : `**/${p}`));
    return createFilter(patterns, null, {resolve: dir});
  }
  return () => true;
}

interface Node {
  type: string;
  start: number;
  end: number;
  // oxc's ESTree nodes. Typed loosely: the pass only reads the fields it checks for.
  [key: string]: any;
}

const ANGULAR_PACKAGE = /[\\/]node_modules[\\/]@angular[\\/]/;

/** Constructors that never have side effects. */
const SIDE_EFFECT_FREE_CONSTRUCTORS = new Set(['InjectionToken']);

/** tslib helpers. Calls to them have side effects, so they're never marked pure. */
const TSLIB_HELPERS = new Set([
  '__extends', '__assign', '__rest', '__decorate', '__param', '__esDecorate', '__runInitializers',
  '__propKey', '__setFunctionName', '__metadata', '__awaiter', '__generator', '__exportStar',
  '__values', '__read', '__privateGet', '__privateSet', '__privateMethod',
  '__addDisposableResource', '__disposeResources',
]);

/** Babel helpers that are called for their side effects. */
const BABEL_HELPERS = new Set(['_defineProperty']);

/** Angular's static definitions. A class whose static members are these can be wrapped. */
const ANGULAR_STATICS = new Set(['ɵcmp', 'ɵdir', 'ɵfac', 'ɵinj', 'ɵmod', 'ɵpipe', 'ɵprov', 'INJECTOR_KEY']);

/** Calls that only record metadata for dev tools and JIT. */
const ANGULAR_METADATA_FUNCTIONS = new Set(['ɵsetClassMetadata', 'ɵsetClassMetadataAsync', 'ɵsetClassDebugInfo']);

/** Static members that hold metadata for JIT only, keyed by the shape their value must have. */
const ANGULAR_STATICS_TO_ELIDE: Record<string, (node: Node) => boolean> = {
  ctorParameters: (node) => node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression',
  decorators: (node) => node.type === 'ArrayExpression',
  propDecorators: (node) => node.type === 'ObjectExpression',
};

function isTslibHelperName(name: string): boolean {
  // Bundlers rename duplicates to `__decorate$1`.
  const [original, suffix, ...rest] = name.split('$');
  if (rest.length > 0 || (suffix !== undefined && !/^\d+$/.test(suffix))) {
    return false;
  }
  return TSLIB_HELPERS.has(original!);
}

/** Whether evaluating the expression can't have side effects. */
function isPure(node: Node): boolean {
  switch (node.type) {
    case 'Identifier':
    case 'Literal':
      return true;
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isPure(node.left) && isPure(node.right);
    case 'UnaryExpression':
      return isPure(node.argument);
    case 'MemberExpression':
      return isPure(node.object) && (!node.computed || isPure(node.property));
    case 'ObjectExpression':
      return node.properties.every((p: Node) => p.type === 'Property' && isPure(p.value));
    case 'ArrayExpression':
      return node.elements.every((e: Node | null) => !e || isPure(e));
    case 'ParenthesizedExpression':
      return isPure(node.expression);
    default:
      return false;
  }
}

function unwrapParentheses(node: Node): Node {
  while (node?.type === 'ParenthesizedExpression') {
    node = node.expression;
  }
  return node;
}

function isFunction(type: string): boolean {
  return type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';
}

function isClass(type: string): boolean {
  return type === 'ClassDeclaration' || type === 'ClassExpression';
}

interface VisitContext {
  functionDepth: number;
  classDepth: number;
  parentFunc: Node | undefined;
}

/** Visits every node after its children, tracking how deep in functions and classes it is. */
function traversePostOrder(root: Node, visit: (node: Node, context: VisitContext) => void): void {
  // `null` marks "children done, visit the node below".
  const stack: (Node | null)[] = [root];
  const functions: Node[] = [];
  let functionDepth = 0;
  let classDepth = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null) {
      const node = stack.pop()!;
      if (isFunction(node.type)) {
        functionDepth--;
        functions.pop();
      } else if (isClass(node.type)) {
        classDepth--;
      }
      visit(node, {functionDepth, classDepth, parentFunc: functions.at(-1)});
      continue;
    }
    if (!current) {
      continue;
    }
    stack.push(current, null);
    if (isFunction(current.type)) {
      functionDepth++;
      functions.push(current);
    } else if (isClass(current.type)) {
      classDepth++;
    }
    // Push children in reverse, so they're visited in source order.
    const children: Node[] = [];
    for (const key in current) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
        continue;
      }
      const value = current[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item.type === 'string') {
            children.push(item);
          }
        }
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        children.push(value);
      }
    }
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!);
    }
  }
}

/**
 * Rewrites one JavaScript module. Returns null when nothing changed. Call it on JavaScript only:
 * after the linker for libraries, and after TypeScript is stripped for the app's own code.
 */
export function optimize(code: string, id: string, options: OptimizeOptions): {code: string; map: unknown} | null {
  const file = id.replace(/[?#].*$/, '');
  const {program, errors} = parseSync(file, code, {lang: 'js', sourceType: 'module', preserveParens: true});
  if (errors.length > 0) {
    return null;
  }
  const source = new MagicString(code);
  // In Angular's side-effect-free packages, every top-level call is pure. Elsewhere, assume
  // top-level code runs for its effects.
  const topLevelSafeMode = !(options.sideEffectFree && ANGULAR_PACKAGE.test(file));
  const wrapDecorators = options.sideEffectFree;
  const editedRanges: {start: number; end: number}[] = [];

  function markEdited(start: number, end: number) {
    editedRanges.push({start, end});
  }

  function isAlreadyEdited(start: number, end: number) {
    return editedRanges.some((r) => start >= r.start && end <= r.end);
  }

  function hasPureComment(start: number): boolean {
    let i = start - 1;
    while (i >= 0 && /\s/.test(code[i]!)) {
      i--;
    }
    if (i < 1 || code[i] !== '/' || code[i - 1] !== '*') {
      return false;
    }
    const commentStart = code.lastIndexOf('/*', i - 1);
    if (commentStart === -1) {
      return false;
    }
    const comment = code.substring(commentStart + 2, i - 1);
    return comment.includes('@__PURE__') || comment.includes('#__PURE__');
  }

  function markPure(node: Node) {
    if (!hasPureComment(node.start)) {
      source.appendLeft(node.start, '/*#__PURE__*/ ');
    }
  }

  function canWrapProperty(propertyName: string, value: Node): boolean {
    if (ANGULAR_STATICS.has(propertyName)) {
      return true;
    }
    const prefix = code.substring(Math.max(0, value.start - 100), value.start);
    if (/(\/\*[\s\S]*?(?:@__PURE__|#__PURE__|@pureOrBreakMyCode)[\s\S]*?\*\/)\s*$/.test(prefix)) {
      return true;
    }
    return isPure(value);
  }

  /** Whether the class's own static members, in its body, are all safe to wrap. */
  function analyzeClassStaticProperties(classNode: Node): boolean {
    let shouldWrap = false;
    for (const element of classNode.body.body as Node[]) {
      if (element.type === 'PropertyDefinition') {
        if (!element.static) {
          continue;
        }
        if (element.key.type === 'Identifier' && (!element.value || canWrapProperty(element.key.name, element.value))) {
          shouldWrap = true;
          continue;
        }
        return false;
      }
      if (element.type === 'StaticBlock') {
        const body = element.body as Node[];
        if (body.length === 0) {
          continue;
        }
        const statement = body.length === 1 ? body[0]! : null;
        const assignment = statement?.type === 'ExpressionStatement' ? statement.expression : null;
        if (
          assignment?.type === 'AssignmentExpression' &&
          assignment.left.type === 'MemberExpression' &&
          assignment.left.object.type === 'ThisExpression' &&
          assignment.left.property.type === 'Identifier' &&
          canWrapProperty(assignment.left.property.name, assignment.right)
        ) {
          shouldWrap = true;
          continue;
        }
        return false;
      }
    }
    return shouldWrap;
  }

  /**
   * TypeScript emits an enum as `var E; (function (E) { ... })(E || (E = {}));`. This turns it
   * into `var E = /*#__PURE__*\/ (function (E) { ...; return E; })(E || {});`.
   */
  function adjustTypeScriptEnums(body: Node[]) {
    for (let i = 0; i < body.length - 1; i++) {
      const statement = body[i]!;
      const declaration =
        statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration'
          ? statement.declaration
          : statement;
      if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'var' || declaration.declarations.length !== 1) {
        continue;
      }
      const decl = declaration.declarations[0];
      if (decl.init || decl.id.type !== 'Identifier') {
        continue;
      }
      const next = body[i + 1]!;
      if (next.type !== 'ExpressionStatement') {
        continue;
      }
      const call = unwrapParentheses(next.expression);
      if (call.type !== 'CallExpression' || call.arguments.length !== 1) {
        continue;
      }
      const arg = unwrapParentheses(call.arguments[0]);
      if (arg.type !== 'LogicalExpression' || arg.operator !== '||') {
        continue;
      }
      const argLeft = unwrapParentheses(arg.left);
      if (argLeft.type !== 'Identifier' || argLeft.name !== decl.id.name) {
        continue;
      }
      const assignment = unwrapParentheses(arg.right);
      if (assignment.type !== 'AssignmentExpression') {
        continue;
      }
      const callee = unwrapParentheses(call.callee);
      if (callee.type !== 'FunctionExpression' || callee.params.length !== 1 || callee.body?.type !== 'BlockStatement') {
        continue;
      }
      const param = callee.params[0];
      if (param.type !== 'Identifier') {
        continue;
      }
      const members = callee.body.body as Node[];
      const allPure = members.every((member) => {
        const value = member.type === 'ExpressionStatement' ? unwrapParentheses(member.expression) : null;
        return value?.type === 'AssignmentExpression' && isPure(value.right);
      });
      if (members.length === 0 || !allPure) {
        continue;
      }
      source.remove(next.start, call.start);
      source.remove(call.end, next.end);
      markEdited(next.start, next.end);
      source.appendRight(callee.body.end - 1, `; return ${param.name};`);
      if (assignment.left.type === 'Identifier') {
        let replacement = code.substring(assignment.right.start, assignment.right.end);
        if (unwrapParentheses(assignment.right).type === 'AssignmentExpression') {
          replacement = `(${replacement})`;
        }
        source.overwrite(arg.right.start, arg.right.end, replacement);
        markEdited(arg.right.start, arg.right.end);
      }
      source.move(call.start, call.end, decl.id.end);
      source.appendLeft(decl.id.end, ' = /*#__PURE__*/ ');
    }
  }

  /**
   * Moves a class and the static-member assignments that follow it into a pure IIFE, and removes
   * JIT-only metadata assignments.
   */
  function adjustStaticMembers(body: Node[]) {
    for (let i = 0; i < body.length; i++) {
      const statement = body[i]!;
      let classNode: Node | null = null;
      let classIdName = '';
      let kind: 'declaration' | 'export-named' | 'export-default' | 'variable' = 'declaration';
      if (statement.type === 'ClassDeclaration') {
        classNode = statement;
      } else if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'ClassDeclaration') {
        classNode = statement.declaration;
        kind = 'export-named';
      } else if (statement.type === 'ExportDefaultDeclaration' && statement.declaration?.type === 'ClassDeclaration') {
        classNode = statement.declaration;
        kind = 'export-default';
      } else if (statement.type === 'VariableDeclaration' && statement.declarations.length === 1) {
        const decl = statement.declarations[0];
        if (decl.init?.type === 'ClassExpression' && decl.id.type === 'Identifier') {
          classNode = decl.init;
          classIdName = decl.id.name;
          kind = 'variable';
        }
      }
      if (kind !== 'variable') {
        classIdName = classNode?.id?.name ?? '';
      }
      if (!classNode || !classIdName) {
        continue;
      }

      const following: {statement: Node; type: 'wrap' | 'elide' | 'decorate'}[] = [];
      let hasPotentialSideEffects = false;
      for (let j = i + 1; j < body.length; j++) {
        const next = body[j]!;
        if (next.type !== 'ExpressionStatement') {
          break;
        }
        const expression = next.expression;
        // __decorate([...], Class.prototype, 'member')
        if (expression.type === 'CallExpression') {
          if (expression.callee.type !== 'Identifier' || expression.callee.name !== '__decorate') {
            break;
          }
          if (wrapDecorators) {
            following.push({statement: next, type: 'decorate'});
          } else {
            hasPotentialSideEffects = true;
          }
          continue;
        }
        if (expression.type !== 'AssignmentExpression') {
          break;
        }
        const left = expression.left;
        // Class = __decorate([...], Class)
        if (left.type === 'Identifier') {
          const right = expression.right;
          if (left.name !== classIdName || right.type !== 'CallExpression' || right.callee.type !== 'Identifier' || right.callee.name !== '__decorate') {
            break;
          }
          if (wrapDecorators) {
            following.push({statement: next, type: 'decorate'});
          } else {
            hasPotentialSideEffects = true;
          }
          continue;
        }
        // Class.member = value
        if (left.type !== 'MemberExpression' || left.object.type !== 'Identifier' || left.object.name !== classIdName || left.property.type !== 'Identifier') {
          break;
        }
        const propertyName: string = left.property.name;
        if (ANGULAR_STATICS_TO_ELIDE[propertyName]?.(expression.right)) {
          following.push({statement: next, type: 'elide'});
        } else if (canWrapProperty(propertyName, expression.right)) {
          following.push({statement: next, type: 'wrap'});
        } else {
          hasPotentialSideEffects = true;
        }
      }

      const shouldWrapClassStatics = analyzeClassStaticProperties(classNode);
      for (const item of following) {
        if (item.type === 'elide') {
          source.remove(item.statement.start, item.statement.end);
          markEdited(item.statement.start, item.statement.end);
        }
      }
      const wrapped = following.filter((item) => item.type !== 'elide');
      if (!hasPotentialSideEffects && (wrapped.length > 0 || shouldWrapClassStatics)) {
        const last = wrapped.length > 0 ? wrapped.at(-1)!.statement : classNode;
        if (kind === 'export-default') {
          source.overwrite(statement.start, classNode.start, '');
          source.appendRight(classNode.start, `let ${classIdName} = /*#__PURE__*/ (() => {\n`);
          source.appendLeft(last.end, `\nreturn ${classIdName};\n})();\nexport { ${classIdName} as default };`);
        } else if (kind === 'variable') {
          source.appendRight(classNode.start, `/*#__PURE__*/ (() => {\nlet ${classIdName} = `);
          const terminator = wrapped.length === 0 ? ';' : '';
          const closing = wrapped.length === 0 ? '})()' : '})();';
          source.appendLeft(last.end, `${terminator}\nreturn ${classIdName};\n${closing}`);
        } else {
          // A declaration, exported or not: `class X {}` becomes `let X = (() => { class X {} ... })();`.
          source.appendRight(classNode.start, `let ${classIdName} = /*#__PURE__*/ (() => {\n`);
          source.appendLeft(last.end, `\nreturn ${classIdName};\n})();`);
        }
        markEdited(statement.start, last.end);
        i += following.length;
      } else if (kind === 'export-default' && !hasPotentialSideEffects) {
        source.overwrite(statement.start, classNode.start, '');
        source.appendLeft(classNode.end, `\nexport { ${classIdName} as default };`);
        markEdited(statement.start, classNode.end);
      }
    }
  }

  traversePostOrder(program as unknown as Node, (node, {functionDepth, classDepth, parentFunc}) => {
    switch (node.type) {
      case 'Program':
      case 'BlockStatement':
        adjustTypeScriptEnums(node.body);
        adjustStaticMembers(node.body);
        break;
      case 'CallExpression': {
        if (isAlreadyEdited(node.start, node.end)) {
          return;
        }
        const callee = node.callee;
        const calleeName =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : undefined;
        // Inside the `(() => { ... ɵsetClassMetadata(...) })()` wrappers Angular's compiler emits.
        if (calleeName && ANGULAR_METADATA_FUNCTIONS.has(calleeName)) {
          if (parentFunc?.type === 'FunctionExpression' || parentFunc?.type === 'ArrowFunctionExpression') {
            source.overwrite(node.start, node.end, 'void 0');
            markEdited(node.start, node.end);
            return;
          }
        }
        if (functionDepth > 0 || classDepth > 0 || topLevelSafeMode) {
          return;
        }
        const target = unwrapParentheses(callee);
        if ((target.type === 'FunctionExpression' || target.type === 'ArrowFunctionExpression') && node.arguments.length !== 0) {
          return;
        }
        if (target.type === 'Identifier' && (isTslibHelperName(target.name) || BABEL_HELPERS.has(target.name))) {
          return;
        }
        markPure(node);
        break;
      }
      case 'NewExpression': {
        if (functionDepth > 0 || classDepth > 0 || isAlreadyEdited(node.start, node.end)) {
          return;
        }
        if (!topLevelSafeMode || (node.callee.type === 'Identifier' && SIDE_EFFECT_FREE_CONSTRUCTORS.has(node.callee.name))) {
          markPure(node);
        }
        break;
      }
    }
  });

  if (!source.hasChanged()) {
    return null;
  }
  return {code: source.toString(), map: source.generateMap({hires: 'boundary', source: file, includeContent: true})};
}
