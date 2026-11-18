/* splitlib.js: what tools/splitcheck.js and the cut maker read a split giant script with (docs/REFACTOR_SPLIT_PLAN.md, 2026-11-18).

   A giant script (a "root", such as net.js) is split by moving a region of its top-level code into a "part" file, inside an install
   function the root calls where the region stood (the plan's section 2.3; tools/srcjoin.js says the shape). Whether a cut is safe is
   judged on the JOINED text, which is the old single file: every name used is resolved there, by a real parser (the one Node ships,
   reached with --expose-internals) and a small scope resolver, and each use is then placed by where it stands: in a part, or in the
   root. From that come
   - what a part must import from its root (a name it uses that is declared outside it) and what the root must bind from the part
     (a name of the part used outside it), both "too many rather than too few": every word of the text counts as well;
   - the two hard failures: a name assigned across the cut (an import is read-only, a glue var is a copy), and a name declared on
     both sides;
   - the load order: a top-level statement that runs before a part is installed, and reaches one of its names directly or through
     any chain of functions it calls, would see undefined;
   - the load order across modules (cycleRisks): a module in an import cycle with the root may run its top-level code before the
     root's body has installed a part, so its top-level code may not reach a name the root binds from a part, directly or through a
     root function it calls.
   On the command line it makes a cut:
     node --expose-internals tools/splitlib.js make <root.js> <part.js> <installName> <first line starts with> <last line starts with> <header file>
   It writes the part (its header from the file, the glue, the body exactly), rewrites the root (the marker, the binding line, the
   part's import as the root's last import, the root's re-export of what the part reads), and stops before writing anything if the
   cut breaks a rule. */
'use strict';
const fs = require('fs'), path = require('path');
const srcjoin = require('./srcjoin');
const SCRIPTS = srcjoin.SCRIPTS;

function acorn() {
    try { return require('internal/deps/acorn/acorn/dist/acorn'); } catch (e) { return null; }
}
function parse(src) {
    const a = acorn();
    if (!a) throw new Error('the parser Node ships is not reachable: run node with --expose-internals');
    return a.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: false });
}

// ---------- a small scope resolver ----------
// Every Identifier read or written is recorded with the scope it stands in; once the whole tree is walked (so that hoisted names are
// known), each is resolved up the scope chain. A use that reaches the module scope is a use of a top-level name.
const SYNC_CALLBACKS = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'reduceRight', 'find', 'findIndex', 'findLast',
    'findLastIndex', 'sort', 'flatMap', 'replace', 'replaceAll', 'from']);
function analyze(src) {
    const ast = parse(src);
    const mod = { kind: 'module', parent: null, names: new Map() };   // name -> [start of each declaration]
    const refs = [];   // { name, start, scope, write, top: index of the top-level statement, fn: top-level function name or null, eager }
    const decl = (scope, name, start) => { if (!scope.names.has(name)) scope.names.set(name, []); scope.names.get(name).push(start); };
    function patternIds(p, out) {
        if (!p) return out;
        switch (p.type) {
            case 'Identifier': out.push(p); break;
            case 'ObjectPattern': p.properties.forEach(q => patternIds(q.type === 'RestElement' ? q.argument : q.value, out)); break;
            case 'ArrayPattern': p.elements.forEach(e => patternIds(e, out)); break;
            case 'RestElement': patternIds(p.argument, out); break;
            case 'AssignmentPattern': patternIds(p.left, out); break;
        }
        return out;
    }
    // Pattern defaults are reads; computed keys too.
    function patternReads(p, ctx) {
        if (!p) return;
        switch (p.type) {
            case 'ObjectPattern': p.properties.forEach(q => { if (q.type === 'RestElement') patternReads(q.argument, ctx); else { if (q.computed) visit(q.key, ctx); patternReads(q.value, ctx); } }); break;
            case 'ArrayPattern': p.elements.forEach(e => patternReads(e, ctx)); break;
            case 'RestElement': patternReads(p.argument, ctx); break;
            case 'AssignmentPattern': patternReads(p.left, ctx); visit(p.right, ctx); break;
            case 'MemberExpression': visit(p, ctx); break;
        }
    }
    function writePattern(p, ctx) {   // an assignment's target: identifiers are writes, members are reads of their object
        if (!p) return;
        if (p.type === 'Identifier') { refs.push({ name: p.name, start: p.start, scope: ctx.scope, write: true, top: ctx.top, fn: ctx.fn, eager: ctx.eager }); return; }
        if (p.type === 'MemberExpression') { visit(p, ctx); return; }
        if (p.type === 'ObjectPattern') { p.properties.forEach(q => { if (q.type === 'RestElement') writePattern(q.argument, ctx); else { if (q.computed) visit(q.key, ctx); writePattern(q.value, ctx); } }); return; }
        if (p.type === 'ArrayPattern') { p.elements.forEach(e => writePattern(e, ctx)); return; }
        if (p.type === 'RestElement') { writePattern(p.argument, ctx); return; }
        if (p.type === 'AssignmentPattern') { writePattern(p.left, ctx); visit(p.right, ctx); }
    }
    // Hoisting: a function's `var`s and the function declarations of its body, found before the body is walked.
    function hoist(body, fnScope) {
        const walkH = n => {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach(d => patternIds(d.id, []).forEach(i => decl(fnScope, i.name, i.start)));
            if (/Function/.test(n.type) || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
            for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walkH); else if (v && typeof v.type === 'string') walkH(v); }
        };
        body.forEach(walkH);
    }
    function blockDecls(stmts, scope) {   // let, const, class and function declarations standing directly in a block
        stmts.forEach(s => {
            if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach(d => patternIds(d.id, []).forEach(i => decl(scope, i.name, i.start)));
            if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) decl(scope, s.id.name, s.id.start);
            if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') && s.declaration) {
                const d = s.declaration;
                if (d.type === 'VariableDeclaration' && d.kind !== 'var') d.declarations.forEach(x => patternIds(x.id, []).forEach(i => decl(scope, i.name, i.start)));
                if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) decl(scope, d.id.name, d.id.start);
            }
        });
    }
    function fnNode(n, ctx, eagerHere) {   // a function: its own scope (a named expression's name in one around it)
        let outer = ctx.scope;
        if (n.type === 'FunctionExpression' && n.id) { outer = { kind: 'fname', parent: outer, names: new Map() }; decl(outer, n.id.name, n.id.start); }
        const fs_ = { kind: 'function', parent: outer, names: new Map() };
        if (n.type !== 'ArrowFunctionExpression') decl(fs_, 'arguments', -1);
        n.params.forEach(p => patternIds(p, []).forEach(i => decl(fs_, i.name, i.start)));
        const inner = Object.assign({}, ctx, { scope: fs_, fnScope: fs_, eager: ctx.eager && eagerHere });
        n.params.forEach(p => patternReads(p, inner));
        if (n.body.type === 'BlockStatement') { hoist(n.body.body, fs_); blockDecls(n.body.body, fs_); n.body.body.forEach(s => visit(s, inner)); }
        else visit(n.body, inner);
    }
    const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
    function visit(n, ctx) {
        if (!n || typeof n.type !== 'string') return;
        switch (n.type) {
            case 'Identifier': refs.push({ name: n.name, start: n.start, scope: ctx.scope, write: false, top: ctx.top, fn: ctx.fn, eager: ctx.eager }); return;
            case 'FunctionDeclaration': fnNode(n, ctx, false); return;
            case 'FunctionExpression': case 'ArrowFunctionExpression': fnNode(n, ctx, false); return;
            case 'ClassDeclaration': case 'ClassExpression': {
                let sc = ctx.scope;
                if (n.type === 'ClassExpression' && n.id) { sc = { kind: 'cname', parent: sc, names: new Map() }; decl(sc, n.id.name, n.id.start); }
                const c2 = Object.assign({}, ctx, { scope: sc });
                if (n.superClass) visit(n.superClass, c2);
                n.body.body.forEach(m => { if (m.computed) visit(m.key, c2); if (m.value) { if (isFn(m.value)) fnNode(m.value, c2, false); else visit(m.value, Object.assign({}, c2, { eager: false })); } if (m.type === 'StaticBlock') m.body.forEach(s => visit(s, c2)); });
                return;
            }
            case 'VariableDeclaration': n.declarations.forEach(d => { patternReads(d.id, ctx); if (d.init) visit(d.init, ctx); }); return;
            case 'BlockStatement': { const sc = { kind: 'block', parent: ctx.scope, names: new Map() }; blockDecls(n.body, sc); const c2 = Object.assign({}, ctx, { scope: sc }); n.body.forEach(s => visit(s, c2)); return; }
            case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
                const sc = { kind: 'block', parent: ctx.scope, names: new Map() }, c2 = Object.assign({}, ctx, { scope: sc });
                const init = n.type === 'ForStatement' ? n.init : n.left;
                if (init && init.type === 'VariableDeclaration' && init.kind !== 'var') init.declarations.forEach(d => patternIds(d.id, []).forEach(i => decl(sc, i.name, i.start)));
                if (n.type === 'ForStatement') { visit(n.init, c2); visit(n.test, c2); visit(n.update, c2); }
                else { if (n.left.type === 'VariableDeclaration') visit(n.left, c2); else writePattern(n.left, c2); visit(n.right, c2); }
                visit(n.body, c2); return;
            }
            case 'SwitchStatement': { visit(n.discriminant, ctx); const sc = { kind: 'block', parent: ctx.scope, names: new Map() }; n.cases.forEach(c => blockDecls(c.consequent, sc)); const c2 = Object.assign({}, ctx, { scope: sc }); n.cases.forEach(c => { visit(c.test, c2); c.consequent.forEach(s => visit(s, c2)); }); return; }
            case 'CatchClause': { const sc = { kind: 'catch', parent: ctx.scope, names: new Map() }; patternIds(n.param, []).forEach(i => decl(sc, i.name, i.start)); const c2 = Object.assign({}, ctx, { scope: sc }); patternReads(n.param, c2); visit(n.body, c2); return; }
            case 'MemberExpression': visit(n.object, ctx); if (n.computed) visit(n.property, ctx); return;
            case 'Property': if (n.computed) visit(n.key, ctx); if (isFn(n.value)) fnNode(n.value, ctx, false); else visit(n.value, ctx); return;
            case 'PropertyDefinition': case 'MethodDefinition': if (n.computed) visit(n.key, ctx); if (n.value) visit(n.value, ctx); return;
            case 'LabeledStatement': visit(n.body, ctx); return;
            case 'BreakStatement': case 'ContinueStatement': return;
            case 'MetaProperty': return;
            case 'TaggedTemplateExpression': if (n.tag.type === 'Identifier') refs.push({ name: n.tag.name, start: n.tag.start, scope: ctx.scope, write: false, top: ctx.top, fn: ctx.fn, eager: ctx.eager, call: true }); else visit(n.tag, ctx); visit(n.quasi, ctx); return;
            case 'ImportDeclaration': return;
            case 'ExportNamedDeclaration': if (n.declaration) visit(n.declaration, ctx); if (!n.source) n.specifiers.forEach(s => visit(s.local, ctx)); return;
            case 'ExportDefaultDeclaration': visit(n.declaration, ctx); return;
            case 'ExportAllDeclaration': return;
            case 'AssignmentExpression': writePattern(n.left, ctx); if (n.operator !== '=') patternReads(n.left, ctx), (n.left.type === 'Identifier' && visit(n.left, ctx)); visit(n.right, ctx); return;
            case 'UpdateExpression': if (n.argument.type === 'Identifier') { writePattern(n.argument, ctx); visit(n.argument, ctx); } else visit(n.argument, ctx); return;
            case 'CallExpression': case 'NewExpression': {
                const c = n.callee;
                // An immediately called function, a function's .call / .apply, a callback a known synchronous method runs, a new Promise's executor: run now.
                if (isFn(c)) { fnNode(c, ctx, true); n.arguments.forEach(a => visit(a, ctx)); return; }
                if (c.type === 'MemberExpression' && !c.computed && isFn(c.object) && (c.property.name === 'call' || c.property.name === 'apply')) { fnNode(c.object, ctx, true); n.arguments.forEach(a => visit(a, ctx)); return; }
                // a name that is called (not only read) is marked so: the load order follows calls, never a function passed along as a value
                if (c.type === 'Identifier') refs.push({ name: c.name, start: c.start, scope: ctx.scope, write: false, top: ctx.top, fn: ctx.fn, eager: ctx.eager, call: true });
                else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && (c.property.name === 'call' || c.property.name === 'apply')) refs.push({ name: c.object.name, start: c.object.start, scope: ctx.scope, write: false, top: ctx.top, fn: ctx.fn, eager: ctx.eager, call: true });
                else visit(c, ctx);
                const sync = (c.type === 'MemberExpression' && !c.computed && SYNC_CALLBACKS.has(c.property.name)) || (n.type === 'NewExpression' && c.type === 'Identifier' && c.name === 'Promise');
                n.arguments.forEach(a => { if (isFn(a)) fnNode(a, ctx, sync); else if (sync && a.type === 'Identifier') refs.push({ name: a.name, start: a.start, scope: ctx.scope, write: false, top: ctx.top, fn: ctx.fn, eager: ctx.eager, call: true }); else visit(a, ctx); });
                return;
            }
        }
        for (const k in n) {
            if (k === 'type' || k === 'start' || k === 'end') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(x => { if (x && typeof x.type === 'string') visit(x, ctx); });
            else if (v && typeof v.type === 'string') visit(v, ctx);
        }
    }
    // The module scope: imports, hoisted vars and functions, top-level lets and consts.
    const imports = new Map();   // local -> { from, imported }
    ast.body.forEach(s => { if (s.type === 'ImportDeclaration') s.specifiers.forEach(sp => { decl(mod, sp.local.name, sp.local.start); imports.set(sp.local.name, { from: s.source.value, imported: sp.imported ? (sp.imported.name || sp.imported.value) : (sp.type === 'ImportDefaultSpecifier' ? 'default' : '*') }); }); });
    hoist(ast.body, mod); blockDecls(ast.body, mod);
    const exportsOf = [];   // the names each export statement of the module exports, as written (local names)
    ast.body.forEach((s, i) => {
        if (s.type === 'ExportNamedDeclaration' && !s.source) s.specifiers.forEach(sp => exportsOf.push({ local: sp.local.name, exported: sp.exported.name || sp.exported.value, start: s.start }));
        const fnName = s.type === 'FunctionDeclaration' ? s.id.name
            : (s.type === 'VariableDeclaration' && s.declarations.length === 1 && s.declarations[0].id.type === 'Identifier' && isFn(s.declarations[0].init) ? s.declarations[0].id.name : null);
        const ctx = { scope: mod, fnScope: mod, top: i, fn: fnName, eager: true };
        if (s.type === 'FunctionDeclaration') { fnNode(s, ctx, true); return; }   // a top-level function: what its body uses when it is called
        if (fnName) { fnNode(s.declarations[0].init, ctx, true); return; }   // var f = function () {} : the same
        visit(s, ctx);
    });
    refs.forEach(r => { let sc = r.scope; while (sc && !sc.names.has(r.name)) sc = sc.parent; r.at = sc; r.module = sc === mod; });
    return { ast, src, mod, refs, imports, exports: exportsOf, top: ast.body };
}

// ---------- regions of the joined text ----------
// Joined text line ranges: which part each line of the joined text belongs to (null for the root's own lines).
function lineStarts(src) { const out = [0]; for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) out.push(i + 1); return out; }
function lineOf(starts, pos) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; }
function regionsOf(rootName, extra) {   // [{ part, from, to }] in joined lines, inclusive; extra: a candidate region in joined lines
    const j = srcjoin.joinRoot(rootName), out = [];
    j.map.forEach(r => { if (r.file !== rootName) out.push({ part: r.file, from: r.j, to: r.j + r.n - 1 }); });
    if (extra) out.push(extra);
    return out.sort((a, b) => a.from - b.from);
}

// What each part needs, judged on the joined text. regions: as regionsOf gives.
function judge(src, regions) {
    const A = analyze(src), starts = lineStarts(src);
    const regionAt = pos => { const l = lineOf(starts, pos); for (const r of regions) if (l >= r.from && l <= r.to) return r.part; return null; };
    const declRegion = new Map();   // top-level name -> Set of regions it is declared in
    A.mod.names.forEach((st, name) => { const s = new Set(); st.forEach(p => s.add(p < 0 ? null : regionAt(p))); declRegion.set(name, s); });
    const parts = regions.map(r => r.part), need = {}, give = {}, problems = [];
    parts.forEach(p => { need[p] = new Set(); give[p] = new Set(); });
    const one = (set) => { const a = [...set]; return a.length === 1 ? a[0] : undefined; };
    // Declared on both sides.
    declRegion.forEach((set, name) => { if (set.size > 1 && [...set].some(x => x !== null)) problems.push({ rule: 'declared on both sides of a cut', name, where: [...set].map(x => x || '(root)') }); });
    A.refs.forEach(r => {
        if (!r.module) return;
        const at = regionAt(r.start), home = one(declRegion.get(r.name));
        if (home === undefined || at === home) return;
        if (at !== null) need[at].add(r.name);   // a part uses a name declared outside it
        if (home !== null) give[home].add(r.name);   // a name of a part used outside it
        if (r.write) problems.push({ rule: 'assigned across a cut', name: r.name, at: at || '(root)', declaredIn: home || '(root)', line: lineOf(starts, r.start) });
    });
    // The load order: a top-level statement that runs before a part is installed, and reaches one of its names.
    // Each top-level statement's uses that run at once, and each top-level function's when it is called: every name it reads, and the
    // names it calls, through which the walk goes on. A function only passed along as a value (net._x = handleMessage) is not entered.
    const fnUses = new Map(), fnCalls = new Map(), stmtUses = [], stmtCalls = [];
    const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
    A.refs.forEach(r => {
        if (!r.module || !r.eager) return;
        const s = A.top[r.top];
        if (r.fn && (s.type === 'FunctionDeclaration' || s.type === 'VariableDeclaration')) { add(fnUses, r.fn, r.name); if (r.call) add(fnCalls, r.fn, r.name); }
        else { if (!stmtUses[r.top]) stmtUses[r.top] = new Set(); stmtUses[r.top].add(r.name); if (r.call) { if (!stmtCalls[r.top]) stmtCalls[r.top] = new Set(); stmtCalls[r.top].add(r.name); } }
    });
    const reachOf = i => { const seen = new Set(stmtUses[i]), done = new Set(), todo = [...(stmtCalls[i] || [])]; while (todo.length) { const n = todo.pop(); if (done.has(n)) continue; done.add(n); (fnUses.get(n) || []).forEach(x => seen.add(x)); (fnCalls.get(n) || []).forEach(x => todo.push(x)); } return seen; };
    stmtUses.forEach((uses, i) => {
        if (!uses) return;
        const s = A.top[i];
        if (/^Export|^Import/.test(s.type)) return;   // an export or an import runs nothing
        const at = regionAt(s.start), line = lineOf(starts, s.start);
        reachOf(i).forEach(name => {
            const home = one(declRegion.get(name) || new Set());
            if (home === undefined || home === null || home === at) return;
            const reg = regions.find(r => r.part === home);
            if (reg && reg.to >= line) problems.push({ rule: 'used before its part is installed', name, part: home, line, at: at || '(root)' });
        });
    });
    // Every word of a part's text counts as a use too (too many rather than too few): the plan's word rule.
    const words = (from, to) => { const out = new Set(), t = src.slice(starts[from - 1], to < starts.length ? starts[to] : src.length), re = /[A-Za-z_$][\w$]*/g; let m; while ((m = re.exec(t))) { const b = t.slice(Math.max(0, m.index - 3), m.index); if (b.endsWith('.') && !b.endsWith('...')) continue; out.add(m[0]); } return out; };
    const wordNeed = {}, wordGive = {};
    regions.forEach(r => {
        const inP = words(r.from, r.to), outside = new Set();
        const lines = starts.length;   // the text outside this part: everything before and after its region
        if (r.from > 1) words(1, r.from - 1).forEach(w => outside.add(w));
        if (r.to < lines) words(r.to + 1, lines).forEach(w => outside.add(w));
        wordNeed[r.part] = new Set([...inP].filter(w => { const s = declRegion.get(w); return s && ![...s].includes(r.part); }));
        wordGive[r.part] = new Set([...outside].filter(w => { const s = declRegion.get(w); return s && s.size === 1 && s.has(r.part); }));
    });
    // What a top-level function of the joined text reaches when it is called: every name it reads, through the functions it calls.
    const fnReach = name => { const seen = new Set(), done = new Set(), todo = [name]; while (todo.length) { const n = todo.pop(); if (done.has(n)) continue; done.add(n); (fnUses.get(n) || []).forEach(x => seen.add(x)); (fnCalls.get(n) || []).forEach(x => todo.push(x)); } return seen; };
    return { A, need, give, wordNeed, wordGive, problems, declRegion, fnReach };
}

// ---------- a module in an import cycle with a root ----------
// A moved function declaration becomes a `var` of the root, bound by its glue line once the part is installed, and undefined before.
// The load-order rule of judge() reads the root's own text only. A module in an import cycle with the root may be evaluated BEFORE the
// root's body runs (which one comes first depends on where the page enters the cycle), and if its top-level code then reaches a name
// the root binds from a part, directly or by calling a root function that reaches one, it sees undefined. cycleRisks says where.
// The graph is read from each script's real text, so an import inside a comment adds an edge: too many rather than too few.
const IMPORT_RE = /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom[ \t]*['"]\.\/([A-Za-z0-9_.-]+\.js)['"]|^[ \t]*import[ \t]*['"]\.\/([A-Za-z0-9_.-]+\.js)['"]/gm;
function importGraph() {
    const g = new Map();
    fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js')).forEach(f => {
        const t = srcjoin.raw(f, 'latin1'), out = new Set();
        IMPORT_RE.lastIndex = 0; let m;
        while ((m = IMPORT_RE.exec(t))) out.add(m[1] || m[2]);
        g.set(f, out);
    });
    return g;
}
// judged: what judge() gave for the joined text and its regions; extra: a part about to be cut ({ part, returns }), so that the cut
// maker can ask before it writes anything.
function cycleRisks(rootName, judged, extra) {
    const g = importGraph(), parts = new Set(srcjoin.partsOf(rootName));
    if (extra) parts.add(extra.part);
    const reach = from => { const seen = new Set(), todo = [from]; while (todo.length) { const n = todo.pop(); (g.get(n) || []).forEach(x => { if (!seen.has(x)) { seen.add(x); todo.push(x); } }); } return seen; };
    const fwd = reach(rootName);
    const inCycle = [...fwd].filter(m => m !== rootName && !parts.has(m) && reach(m).has(rootName));
    const bound = new Set(); parts.forEach(p => { if (extra && p === extra.part) (extra.returns || []).forEach(n => bound.add(n)); else (partGlue(p).returns || []).forEach(n => bound.add(n)); });
    const partOf = n => { const s = judged.declRegion.get(n); if (!s || s.size !== 1) return null; const h = [...s][0]; return h && parts.has(h) ? h : null; };
    const touches = n => (bound.has(n) ? n : [...judged.fnReach(n)].find(x => partOf(x)) || null);
    const risks = [];
    inCycle.forEach(m => {
        const A = analyze(srcjoin.raw(m, 'utf8'));
        const fromRoot = new Map(); A.imports.forEach((v, local) => { if (v.from === './' + rootName) fromRoot.set(local, v.imported); });
        if (!fromRoot.size) return;
        const fnUses = new Map(), fnCalls = new Map(), stmtUses = [], stmtCalls = [];
        const add = (mp, k, v) => { if (!mp.has(k)) mp.set(k, new Set()); mp.get(k).add(v); };
        A.refs.forEach(r => {
            if (!r.module || !r.eager) return;
            const s = A.top[r.top];
            if (r.fn && (s.type === 'FunctionDeclaration' || s.type === 'VariableDeclaration')) { add(fnUses, r.fn, r.name); if (r.call) add(fnCalls, r.fn, r.name); }
            else { (stmtUses[r.top] = stmtUses[r.top] || new Set()).add(r.name); if (r.call) (stmtCalls[r.top] = stmtCalls[r.top] || new Set()).add(r.name); }
        });
        stmtUses.forEach((uses, i) => {
            if (!uses || /^Export|^Import/.test(A.top[i].type)) return;
            const seen = new Set(uses), done = new Set(), todo = [...(stmtCalls[i] || [])];
            while (todo.length) { const n = todo.pop(); if (done.has(n)) continue; done.add(n); (fnUses.get(n) || []).forEach(x => seen.add(x)); (fnCalls.get(n) || []).forEach(x => todo.push(x)); }
            seen.forEach(local => { if (!fromRoot.has(local)) return; const t = touches(fromRoot.get(local)); if (t) risks.push({ module: m, name: fromRoot.get(local), reaches: t, line: lineOf(lineStarts(A.src), A.top[i].start) }); });
        });
    });
    return { inCycle, risks };
}

// The names a part's real glue says it imports and returns, and what its root's glue binds and exports.
const GLUE_IMPORT = /^import \{ ([^}]*) \} from '\.\/([a-z0-9]+\.js)';   \/\/ \[split:glue\]\r?$/;
function partGlue(partName) {
    const t = srcjoin.raw(partName, 'latin1'), lines = t.split('\n').map(l => l.replace(/\r$/, ''));
    const imp = lines.map(l => GLUE_IMPORT.exec(l)).filter(Boolean)[0];
    const ret = lines.map(l => /^return \{ (.*) \};   \/\/ \[split:glue\]$/.exec(l)).filter(Boolean)[0];
    const inst = lines.map(l => /^export function ([A-Za-z_$][\w$]*)\(\) \{   \/\/ \[split:glue\]$/.exec(l)).filter(Boolean)[0];
    return {
        imports: imp ? imp[1].split(',').map(s => s.trim()).filter(Boolean) : null,
        from: imp ? imp[2] : null,
        returns: ret ? ret[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean) : null,
        install: inst ? inst[1] : null,
        lines
    };
}

// ---------- making a cut ----------
const HEADER_MAX = 4000;
function makeCut(rootName, partName, install, firstStarts, lastStarts, header) {
    if (!/^[a-z0-9]+\.js$/.test(partName)) throw new Error('a part is named in lower case letters and digits: ' + partName);
    if (fs.existsSync(path.join(SCRIPTS, partName))) throw new Error(partName + ' is there already');
    const rootTxt = srcjoin.raw(rootName, 'latin1'), eol = rootTxt.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const lines = rootTxt.split('\n'), bare = l => l.replace(/\r$/, '');
    const findOne = (pre) => { const hits = []; lines.forEach((l, i) => { if (bare(l).startsWith(pre)) hits.push(i); }); if (hits.length !== 1) throw new Error('"' + pre + '" starts ' + hits.length + ' lines of ' + rootName); return hits[0]; };
    const a = findOne(firstStarts);
    let b = findOne(lastStarts);
    if (b < a) throw new Error('the last line stands before the first');
    { // where the last line found starts a top-level statement, the region runs to that statement's end
        const RA = analyze(srcjoin.raw(rootName, 'utf8')), st = lineStarts(srcjoin.raw(rootName, 'utf8'));
        RA.top.forEach(s => { if (lineOf(st, s.start) === b + 1) b = lineOf(st, s.end - 1) - 1; });
    }
    // Where the region stands in the joined text.
    const J = srcjoin.joinRoot(rootName), jl = rl => { for (const r of J.map) if (r.file === rootName && r.line === rl) return r.j; throw new Error('line ' + rl + ' is no root line'); };
    const region = { part: partName, from: jl(a + 1), to: jl(b + 1) };
    if (region.to - region.from !== b - a) throw new Error('the region holds another part\'s marker');
    // The region must be whole top-level statements.
    const src = J.text, starts = lineStarts(src), A0 = analyze(src);
    A0.top.forEach(s => { const l1 = lineOf(starts, s.start), l2 = lineOf(starts, s.end - 1); const inA = l1 >= region.from && l1 <= region.to, inB = l2 >= region.from && l2 <= region.to; if (inA !== inB) throw new Error('a top-level statement crosses the region\'s edge at joined line ' + l1); });
    const regions = regionsOf(rootName, region);
    const J2 = judge(src, regions);
    if (J2.problems.length) { const e = new Error('the cut breaks a rule:\n' + J2.problems.map(p => '  ' + JSON.stringify(p)).join('\n')); e.problems = J2.problems; throw e; }
    const imports = [...new Set([...J2.need[partName], ...J2.wordNeed[partName]])].sort();
    const returns = [...new Set([...J2.give[partName], ...J2.wordGive[partName]])].sort();
    // A module in an import cycle with the root whose top-level code would reach one of the moved names before the part is installed.
    const cyc = cycleRisks(rootName, J2, { part: partName, returns: returns });
    if (cyc.risks.length) { const e = new Error('the cut breaks the load order of a module in a cycle with ' + rootName + ':\n' + cyc.risks.map(p => '  ' + JSON.stringify(p)).join('\n')); e.problems = cyc.risks; throw e; }
    // The root's names it must export for the part: those it does not export already.
    const R = analyze(srcjoin.raw(rootName, 'utf8'));
    const exported = new Set(R.exports.map(e => e.exported));
    const reexport = imports.filter(n => !exported.has(n));
    R.exports.forEach(e => { if (e.local !== e.exported && imports.includes(e.exported)) throw new Error('the root exports ' + e.local + ' as ' + e.exported); });
    // The part.
    if (header.length > HEADER_MAX || /\*\//.test(header.slice(2, -2)) || !/^\/\*[\s\S]*\*\/$/.test(header.trim())) throw new Error('the header is one block comment');
    const glue = ' '.repeat(3) + '// [split:glue]';
    header = Buffer.from(header, 'utf8').toString('latin1');   // the part is written byte for byte, as latin1
    const body = lines.slice(a, b + 1).map(bare);
    const part = [].concat(
        header.trim().split(/\r?\n/),
        ['// [split:of ' + rootName + ']',
            'import { ' + imports.join(', ') + ' } from \'./' + rootName + '\';' + glue,
            'export function ' + install + '() {' + glue,
            '// [split:body-start]'],
        body,
        ['// [split:body-end]',
            'return { ' + returns.map(n => n + ': ' + n).join(', ') + ' };' + glue,
            '}' + glue]
    ).join(eol) + eol;
    // The root: the region becomes the marker and the binding line; the part's import and the root's re-export after its last import.
    const bind = 'var _' + install + ' = ' + install + '()' + returns.map(n => ', ' + n + ' = _' + install + '.' + n).join('') + ';' + glue;
    const lastImport = R.top.filter(s => s.type === 'ImportDeclaration').pop();
    const lastImportLine = lineOf(lineStarts(srcjoin.raw(rootName, 'utf8')), lastImport.end - 1) - 1;   // 0-based
    const out = [];
    lines.forEach((l, i) => {
        if (i === a) { out.push('// [split:' + partName + ']' + (l.endsWith('\r') ? '\r' : '')); out.push(bind + (l.endsWith('\r') ? '\r' : '')); return; }
        if (i > a && i <= b) return;
        out.push(l);
        if (i === lastImportLine) {
            const cr = l.endsWith('\r') ? '\r' : '';
            out.push('import { ' + install + ' } from \'./' + partName + '\';' + glue + cr);
            if (reexport.length) out.push('export { ' + reexport.join(', ') + ' };' + glue + cr);
        }
    });
    if (a <= lastImportLine) throw new Error('the region stands among the imports');
    return { part, root: out.join('\n'), imports, returns, reexport, region };
}

module.exports = { acorn, parse, analyze, judge, regionsOf, partGlue, makeCut, lineStarts, lineOf, GLUE_IMPORT, importGraph, cycleRisks };

if (require.main === module) {
    const a = process.argv.slice(2);
    if (a[0] === 'make') {
        if (!acorn()) { console.log('run with node --expose-internals'); process.exit(1); }
        const [, root, part, install, first, last, headerFile] = a;
        let r;
        try { r = makeCut(root, part, install, first, last, fs.readFileSync(headerFile, 'utf8')); }
        catch (e) { console.log('NOT MADE: ' + e.message); process.exit(1); }
        fs.writeFileSync(path.join(SCRIPTS, part), Buffer.from(r.part, 'latin1'));
        fs.writeFileSync(path.join(SCRIPTS, root), Buffer.from(r.root, 'latin1'));
        console.log('made ' + part + ' from ' + root + ': joined lines ' + r.region.from + '..' + r.region.to + ', ' + r.imports.length + ' imports, ' + r.returns.length + ' names returned, ' + r.reexport.length + ' re-exported');
    } else console.log('Usage: node --expose-internals tools/splitlib.js make <root.js> <part.js> <installName> <first line starts with> <last line starts with> <header file>');
}
