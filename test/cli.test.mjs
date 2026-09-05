import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseArgs } from "../cli/args.mjs";
import { findModules, findPackages, findSources, packageForFile, readModuleName } from "../cli/project.mjs";
import { readPackageInventory } from "../cli/packages.mjs";
import { dataUrl, startServer, viewerUrl } from "../cli/server.mjs";
import { buildProgram, testing } from "../cli/simplify.mjs";

function identifier(name) {
  return {
    kind: "Expr::Ident",
    children: {
      id: {
        kind: "Var",
        children: {
          name: { kind: "LongIdent::Ident", children: { value: name } },
        },
      },
    },
  };
}

function functionDefinition(name, body) {
  return {
    kind: "Impl::TopFuncDef",
    loc: { file: "main.mbt", start: { line: 1, column: 1 }, end: { line: 2, column: 2 } },
    children: {
      fun_decl: {
        kind: "FunDecl",
        children: {
          name: { kind: "Binder", children: { name } },
          decl_params: { kind: "FunDecl::ParameterList", children: [] },
          return_type: null,
          doc: name === "main" ? "Application entry" : "",
        },
      },
      decl_body: { kind: "DeclBody::DeclBody", children: { expr: body, local_types: [] } },
      where_clause: null,
    },
  };
}

function topBinding(name, initializer) {
  return {
    kind: "Impl::TopLetDef",
    loc: { file: "main.mbt", start: { line: 4, column: 1 }, end: { line: 4, column: 30 } },
    children: {
      binder: { kind: "Binder", children: { name } },
      expr: initializer,
      ty: null,
    },
  };
}

function typeName(name) {
  return {
    kind: "Type::Name",
    children: {
      constr_id: {
        kind: "ConstrId",
        children: { id: { kind: "LongIdent::Ident", children: { value: name } } },
      },
      tys: { kind: "Type::Name::TypeList", children: [] },
    },
  };
}

function positionalParameter(name, type = null, line = 1) {
  return {
    kind: "Parameter::Positional",
    loc: { file: "main.mbt", start: { line, column: 4 }, end: { line, column: 12 } },
    children: {
      binder: { kind: "Binder", children: { name } },
      ty: type,
    },
  };
}

function variantDefinition(name, doc, constructors) {
  return {
    kind: "Impl::TopTypeDef",
    loc: { file: "main.mbt", start: { line: 6, column: 1 }, end: { line: 10, column: 2 } },
    children: {
      value: {
        kind: "TypeDecl",
        children: {
          tycon: name,
          params: { kind: "TypeDecl::ParamList", children: [] },
          components: {
            kind: "TypeDesc::Variant",
            children: {
              value: {
                kind: "TypeDesc::Variant::ConstrList",
                children: constructors.map(([constructor, args]) => ({
                  kind: "ConstrDecl",
                  children: {
                    name: { kind: "ConstrName", children: { name: constructor } },
                    args: args.length === 0
                      ? null
                      : {
                          kind: "ConstrDecl::ArgList",
                          children: args.map((arg) => ({
                            kind: "ConstrParam",
                            children: { ty: typeName(arg) },
                          })),
                        },
                    doc: "",
                  },
                })),
              },
            },
          },
          doc,
        },
      },
    },
  };
}

function implementationDefinition(name, body) {
  return {
    kind: "Impl::TopImpl",
    loc: { file: "main.mbt", start: { line: 12, column: 1 }, end: { line: 14, column: 2 } },
    children: {
      self_ty: typeName("Store"),
      trait: { kind: "TypeName", children: { name: { kind: "LongIdent::Ident", children: { value: "Default" } } } },
      method_name: { kind: "Binder", children: { name } },
      params: { kind: "Impl::TopImpl::ParamList", children: [] },
      ret_ty: typeName("Store"),
      body: { kind: "DeclBody::DeclBody", children: { expr: body, local_types: [] } },
      doc: "Construct the initial store.",
    },
  };
}

function findSimplified(node, name) {
  if (!node || typeof node !== "object") return undefined;
  if (node.name === name) return node;
  for (const child of node.children ?? []) {
    const found = findSimplified(child, name);
    if (found) return found;
  }
  return undefined;
}

test("parseArgs uses safe loopback defaults", () => {
  const options = parseArgs(["build", ".", "--include-deps", "--port", "4312", "--local"]);
  assert.equal(options.command, "build");
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 4312);
  assert.equal(options.includeDeps, true);
  assert.equal(options.local, true);
  assert.equal(options.out, path.resolve(".monastry"));
});

test("viewer URL connects hosted or local frontend to the data service", () => {
  assert.equal(dataUrl("0.0.0.0", 4177), "http://127.0.0.1:4177/api/index.json");
  assert.equal(dataUrl("::1", 4177), "http://[::1]:4177/api/index.json");
  const hosted = new URL(viewerUrl("127.0.0.1", 4177, false));
  assert.equal(hosted.origin + hosted.pathname, "https://r.tiye.me/Memkits/monastry/");
  assert.equal(hosted.searchParams.get("data"), "http://127.0.0.1:4177/api/index.json");
  const local = new URL(viewerUrl("127.0.0.1", 4312, true));
  assert.equal(local.origin, "http://127.0.0.1:5173");
  assert.equal(local.searchParams.get("data"), "http://127.0.0.1:4312/api/index.json");
});

test("data service returns the index with cross-origin headers", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-server-"));
  const dataFile = path.join(root, "index.json");
  fs.writeFileSync(dataFile, '{"schemaVersion":2}');
  const server = startServer({ host: "127.0.0.1", port: 0, dataFile, local: true });
  await once(server, "listening");
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/index.json`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-private-network"), "true");
  assert.deepEqual(await response.json(), { schemaVersion: 2 });
  const preflight = await fetch(`http://127.0.0.1:${address.port}/api/index.json`, {
    method: "OPTIONS",
  });
  assert.equal(preflight.status, 204);
});

test("project discovery recognizes text manifests and dependency policy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-test-"));
  try {
    fs.writeFileSync(path.join(root, "moon.mod"), 'name = "local/demo"\n');
    fs.mkdirSync(path.join(root, "lib"));
    fs.writeFileSync(path.join(root, "lib", "moon.pkg"), "");
    fs.writeFileSync(path.join(root, "lib", "top.mbt"), "pub fn answer() -> Int { 42 }\n");
    fs.mkdirSync(path.join(root, ".mooncakes", "dep"), { recursive: true });
    fs.writeFileSync(path.join(root, ".mooncakes", "dep", "dep.mbt"), "let x = 1\n");
    assert.equal(readModuleName(root), "local/demo");
    assert.deepEqual(findPackages(root), [path.join(root, "lib")]);
    assert.equal(findSources(root, false).length, 1);
    assert.equal(findSources(root, true).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("discovery respects nested modules, dependency source roots, and symlinks", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-packages-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frontend = path.join(root, "frontend");
  const dependency = path.join(frontend, ".mooncakes", "vendor", "dep");
  const packageDir = path.join(dependency, "src", "nested");
  fs.mkdirSync(packageDir, { recursive: true });
  for (const moduleDir of [root, frontend, dependency]) {
    fs.writeFileSync(path.join(moduleDir, "moon.mod"), 'name = "test/module"\n');
  }
  fs.writeFileSync(path.join(packageDir, "moon.pkg.json"), "{}");
  const source = path.join(packageDir, "top.mbt");
  fs.writeFileSync(source, "");
  fs.symlinkSync(root, path.join(frontend, "cycle"), "dir");
  assert.deepEqual(findModules(root), [root, frontend]);
  assert.deepEqual(findPackages(root), []);
  assert.deepEqual(findPackages(root, true), [packageDir]);
  assert.equal(packageForFile(source, findPackages(root, true), root), "frontend/.mooncakes/vendor/dep/src/nested");
  assert.equal(findSources(root, true)[0].dependency, true);
});

test("Moon package inventory retains canonical names, aliases and separate test imports", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-inventory-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const moduleRoot = path.join(root, "frontend");
  const app = path.join(moduleRoot, "src", "app");
  const dependency = path.join(moduleRoot, ".mooncakes/vendor/ui/src");
  fs.mkdirSync(path.join(moduleRoot, "_build"), { recursive: true });
  const inventoryFile = path.join(moduleRoot, "_build/packages.json");
  const inventory = {
    source_dir: moduleRoot,
    packages: [{
      root: "example/viewer", rel: "app", "root-path": app, "is-main": true,
      files: { [path.join(app, "main.mbt")]: {} },
      "wbtest-files": { [path.join(app, "main_wbtest.mbt")]: {} },
      "test-files": { [path.join(app, "main_test.mbt")]: {} },
      deps: [{ alias: "ui", fspath: dependency }],
      "wbtest-deps": [{ alias: "assertions", fspath: path.join(root, "assertions") }],
      "test-deps": [{ alias: "app", fspath: app }],
    }],
  };
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  const files = readPackageInventory(moduleRoot, root);
  const main = files.get(path.join(app, "main.mbt"));
  assert.equal(main.packageName, "example/viewer/app");
  assert.equal(main.package, "frontend/src/app");
  assert.equal(main.moduleRoot, "frontend");
  assert.equal(main.executable, true);
  assert.deepEqual(main.imports, { ui: "frontend/.mooncakes/vendor/ui/src" });
  assert.equal(files.get(path.join(app, "main_wbtest.mbt")).imports.assertions, "assertions");
  assert.deepEqual(files.get(path.join(app, "main_test.mbt")).imports, { app: "frontend/src/app" });
  inventory.source_dir = "/another-checkout";
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  assert.throws(() => readPackageInventory(moduleRoot, root), /stale/);
});

function navigationFile(id, packageDir, ast, imports = {}) {
  return { id, path: `${packageDir}/top.mbt`, package: packageDir, imports, dependency: false, ast };
}

function usingDeclaration(alias, target, binder = target) {
  return { kind: "Impl::TopUsing", children: {
    pkg: { kind: "Label", children: { name: alias } },
    names: { kind: "Impl::TopUsing::NameList", children: [{ kind: "UsingName", children: {
      kind: "value", name: { kind: "AliasTarget", children: {
        binder: { kind: "Binder", children: { name: binder } },
        target: binder === target ? null : { kind: "Binder", children: { name: target } },
      } },
    } }] },
  } };
}

test("using declarations resolve renamed symbols across files in the same package", () => {
  const program = buildProgram([
    navigationFile("app", "app", [functionDefinition("main", identifier("draw"))], { ui: "ui" }),
    navigationFile("imports", "app", [usingDeclaration("ui", "div", "draw")], { ui: "ui" }),
    navigationFile("ui", "ui", [functionDefinition("div", identifier("unused"))]),
    navigationFile("other", "other", [functionDefinition("draw", identifier("wrong"))]),
  ], "/nonexistent");
  const ref = program.entry.ast.children[0];
  const target = program.definitions.find((d) => d.id === ref.targetId);
  assert.equal(target.name, "div");
  assert.equal(target.package, "ui");
  assert.equal(ref.resolution, "using");
});

test("using declarations do not leak from whitebox tests into production files", () => {
  const imports = navigationFile("tests", "app", [usingDeclaration("ui", "div")], { ui: "ui" });
  imports.sourceKind = "whitebox-test";
  const program = buildProgram([
    navigationFile("app", "app", [functionDefinition("main", identifier("div"))]),
    imports,
    navigationFile("ui", "ui", [functionDefinition("div", identifier("unused"))]),
  ], "/nonexistent");
  assert.equal(program.entry.ast.children[0].targetId, undefined);
});

test("qualified references use their import even when local and other packages share the name", () => {
  const files = [
    navigationFile("app", "app", [
      functionDefinition("main", identifier("ui.render")),
      functionDefinition("render", identifier("local")),
    ], { ui: ".mooncakes/vendor/ui/src", other: "other" }),
    navigationFile("ui", ".mooncakes/vendor/ui/src", [functionDefinition("render", identifier("styles.style_counter"))], { styles: ".mooncakes/vendor/ui/src/styles" }),
    navigationFile("styles", ".mooncakes/vendor/ui/src/styles", [topBinding("style_counter", identifier("unavailable"))]),
    navigationFile("other", "other", [functionDefinition("render", identifier("wrong"))]),
  ];
  files[1].dependency = true;
  files[2].dependency = true;
  const program = buildProgram(files, "/nonexistent");
  const render = program.definitions.find((d) => d.fileId === "ui");
  const style = program.definitions.find((d) => d.fileId === "styles");
  assert.equal(program.entry.ast.children[0].targetId, render.id);
  assert.equal(program.entry.ast.children[0].resolution, "import");
  assert.equal(render.ast.children[0].targetId, style.id);
  assert.equal(render.ast.children[0].resolution, "import");
});

test("unimported and unavailable definitions never fall back to a global leaf name", () => {
  for (const [name, imports, expected] of [
    ["render", {}, "unresolved"],
    ["missing.render", {}, "unknown-import"],
    ["ui.render", { ui: "not-indexed" }, "dependency-not-indexed"],
    ["@ui.render", { ui: "not-indexed" }, "dependency-not-indexed"],
  ]) {
    const program = buildProgram([
      navigationFile("app", "app", [functionDefinition("main", identifier(name))], imports),
      navigationFile("other", "other", [functionDefinition("render", identifier("unused"))]),
    ], "/nonexistent");
    const ref = program.entry.ast.children[0];
    assert.equal(ref.targetId, undefined);
    assert.equal(ref.resolution, expected);
  }
});

test("ambiguous package definitions remain unresolved with candidate identities", () => {
  const program = buildProgram([
    navigationFile("app", "app", [functionDefinition("main", identifier("duplicate")), functionDefinition("duplicate", identifier("a"))]),
    navigationFile("other-file", "app", [functionDefinition("duplicate", identifier("b"))]),
  ], "/nonexistent");
  const ref = program.entry.ast.children[0];
  assert.equal(ref.targetId, undefined);
  assert.equal(ref.resolution, "ambiguous");
  assert.equal(ref.candidateIds.length, 2);
});

test("qualified references bypass locals while unqualified references preserve lexical shadowing", () => {
  for (const qualified of [true, false]) {
    const main = functionDefinition("main", identifier(qualified ? "ui.render" : "render"));
    main.children.fun_decl.children.decl_params.children.push(positionalParameter("render", typeName("Int")));
    const program = buildProgram([
      navigationFile("app", "app", [main], { ui: "ui" }),
      navigationFile("ui", "ui", [functionDefinition("render", identifier("unused"))]),
    ], "/nonexistent");
    const ref = program.entry.ast.children[1];
    const target = program.definitions.find((d) => d.id === ref.targetId);
    assert.equal(target.kind, qualified ? "function" : "parameter");
    assert.equal(ref.resolution, qualified ? "import" : "local");
  }
});

test("fields and dynamically dispatched methods do not open unrelated same-named functions", () => {
  const access = {
    kind: "Expr::DotApply",
    children: {
      self: identifier("value"),
      method_name: { kind: "Label", children: { name: "update" } },
      args: { kind: "Expr::Apply::ArgumentList", children: [] },
    },
  };
  const program = buildProgram([
    navigationFile("app", "app", [functionDefinition("main", access), functionDefinition("update", identifier("unrelated"))]),
  ], "/nonexistent");
  const method = program.entry.ast.children[0];
  assert.equal(method.resolution, "needs-type");
  assert.equal(method.targetId, undefined);
  assert.equal(method.candidateIds.length, 1);
});

test("a dependency executable main is never the application entry", () => {
  const dependency = navigationFile("dependency", ".mooncakes/vendor/tool", [functionDefinition("main", identifier("unused"))]);
  dependency.dependency = true;
  dependency.executable = true;
  const program = buildProgram([dependency], "/nonexistent");
  assert.equal(program.entry, null);
  assert.deepEqual(program.entries, []);
});

test("an explicitly typed imported receiver selects its own method and keeps segment metadata", () => {
  const call = {
    kind: "Expr::DotApply", children: {
      self: identifier("app"), method_name: { kind: "Label", children: { name: "update" } },
      args: { kind: "Expr::DotApply::ArgList", children: [] },
    },
  };
  const main = functionDefinition("main", call);
  main.children.fun_decl.children.decl_params.children.push(positionalParameter("app", typeName("ui.App")));
  const method = functionDefinition("update", identifier("unused"));
  method.children.fun_decl.children.type_name = { kind: "TypeName", children: { name: { kind: "LongIdent::Ident", children: { value: "App" } } } };
  const files = [
    navigationFile("app", "app", [main, functionDefinition("update", identifier("wrong"))], { ui: "ui" }),
    navigationFile("ui", "ui", [variantDefinition("App", "The application.", []), method]),
  ];
  const program = buildProgram(files, "/nonexistent");
  const target = program.definitions.find((d) => d.fileId === "ui" && d.name === "update");
  const view = program.entry.ast.children[1];
  assert.equal(view.targetId, target.id);
  assert.equal(view.resolution, "declared-receiver");
  assert.equal(view.segments[1].targetId, target.id);
  assert.equal(view.segments[1].symbolType, target.ast.type);
  assert.equal(view.segments[0].symbolType, "ui.App");
});

test("simplified AST compacts lambda, interpolation, and binary wrappers", () => {
  const field = (record, name) => ({
    kind: "Expr::Field",
    children: {
      record,
      accessor: {
        kind: "Accessor::Label",
        children: { value: { kind: "Label", children: { name } } },
      },
    },
  });
  const interpolation = {
    kind: "Expr::Interp",
    children: {
      elems: {
        kind: "Expr::Interp::ElemList",
        children: [
          { kind: "InterpElem::Literal", children: { repr: "clicked " } },
          { kind: "InterpElem::Source", children: { source: "counter" } },
        ],
      },
    },
  };
  const binary = {
    kind: "Expr::Infix",
    children: {
      op: identifier("+"),
      lhs: identifier("counter"),
      rhs: {
        kind: "Expr::Constant",
        children: { constant: { kind: "Constant::Double", children: { value: "1.0" } } },
      },
    },
  };
  const lambda = testing.normalizeNode({
    kind: "Expr::Function",
    children: {
      func: {
        kind: "Func::Lambda",
        children: {
          parameters: {
            kind: "Func::Lambda::ParameterList",
            children: [{ kind: "Parameter::DiscardPositional", children: { ty: null } }],
          },
          body: {
            kind: "Expr::Sequence",
            children: {
              exprs: { kind: "Expr::Sequence::ExprList", children: [interpolation] },
              last_expr: binary,
            },
          },
        },
      },
    },
  }, "value", {});
  assert.equal(lambda.kind, "Lambda");
  assert.equal(lambda.value, "_");
  assert.deepEqual(lambda.children.map((child) => child.kind), ["Interp", "BinaryOperation"]);
  assert.deepEqual(lambda.children.map((child) => child.value), [
    '"clicked {counter}"',
    "counter + 1.0",
  ]);
  const fieldAccess = testing.normalizeNode(
    field(field(identifier("app"), "store"), "val"),
    "value",
    {},
  );
  assert.deepEqual(fieldAccess, {
    kind: "FieldAccess",
    role: "value",
    name: "app.store.val",
    referenceName: "app",
    segments: [
      { kind: "Identifier", name: "app", referenceName: "app" },
      { kind: "FieldSegment", name: "store", referenceName: "store" },
      { kind: "FieldSegment", name: "val", referenceName: "val" },
    ],
  });
  const methodCall = testing.normalizeNode({
    kind: "Expr::DotApply",
    children: {
      self: field(field(identifier("app"), "store"), "val"),
      method_name: { kind: "Label", children: { name: "update" } },
      args: {
        kind: "Expr::DotApply::ArgList",
        children: [{
          kind: "Argument",
          children: {
            value: identifier("op"),
            kind: { kind: "ArgumentKind::Positional", children: {} },
          },
        }],
      },
    },
  }, "body", {});
  assert.equal(methodCall.kind, "MethodCall");
  assert.equal(methodCall.name, "app.store.val.update");
  assert.equal(methodCall.referenceName, "update");
  assert.deepEqual(methodCall.children.map((child) => child.name), ["op"]);
  assert.deepEqual(methodCall.segments.map((segment) => segment.name), [
    "app",
    "store",
    "val",
    "update(op)",
  ]);
  const chainedMethod = testing.normalizeNode({
    kind: "Expr::DotApply",
    children: {
      self: {
        kind: "Expr::DotApply",
        children: {
          self: identifier("window"),
          method_name: { kind: "Label", children: { name: "document" } },
          args: { kind: "Expr::DotApply::ArgList", children: [] },
        },
      },
      method_name: { kind: "Label", children: { name: "unwrap" } },
      args: { kind: "Expr::DotApply::ArgList", children: [] },
    },
  }, "body", {});
  assert.equal(chainedMethod.name, "window.document().unwrap()");
  assert.equal(chainedMethod.children, undefined);
  assert.deepEqual(chainedMethod.segments.map((segment) => segment.name), [
    "window",
    "document()",
    "unwrap()",
  ]);
  const mutation = testing.normalizeNode({
    kind: "Expr::Mutate",
    children: {
      record: field(identifier("app"), "store"),
      accessor: {
        kind: "Accessor::Label",
        children: { value: { kind: "Label", children: { name: "val" } } },
      },
      field: identifier("next_store"),
      augmented_by: null,
    },
  }, "body", {});
  assert.equal(mutation.kind, "Mutation");
  assert.equal(mutation.name, "app.store.val");
  assert.equal(mutation.referenceName, "app");
  assert.deepEqual(mutation.children.map((child) => child.name), ["next_store"]);
  const recordField = testing.normalizeNode({
    kind: "FieldDef",
    children: {
      label: { kind: "Label", children: { name: "status" } },
      expr: identifier("current_status"),
    },
  }, "fields", {});
  assert.equal(recordField.kind, "RecordField");
  assert.equal(recordField.name, "status");
  assert.deepEqual(recordField.children.map((child) => child.name), ["current_status"]);
  const record = testing.normalizeNode({
    kind: "Expr::Record",
    children: {
      fields: { kind: "Expr::Record::FieldList", children: [] },
      trailing: { kind: "Trailing::Comma", children: {} },
    },
  }, "value", {});
  assert.equal(record.children, undefined);
  const group = testing.normalizeNode({
    kind: "Expr::Group",
    children: {
      expr: identifier("work"),
      group: { kind: "Group::Brace", children: {} },
    },
  }, "value", {});
  assert.deepEqual(group.children.map((child) => child.name), ["work"]);
});

test("leading comments become definition documentation", () => {
  const source = [
    "///|",
    "/// Opens a definition in a new panel.",
    "// Keeps the current source column.",
    "fn open_panel() -> Unit {}",
  ].join("\n");
  assert.equal(
    testing.leadingDocumentation(source, 4),
    "Opens a definition in a new panel.\nKeeps the current source column.",
  );
});

test("typed local bindings and lambda parameters link to their local definitions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-locals-"));
  try {
    fs.writeFileSync(path.join(root, "moon.pkg"), 'pkgtype(kind: "executable")\n');
    const typedLet = {
      kind: "Expr::Let",
      loc: { file: "main.mbt", start: { line: 2, column: 3 }, end: { line: 8, column: 4 } },
      children: {
        pattern: {
          kind: "Pattern::Constraint",
          children: {
            pat: {
              kind: "Pattern::Var",
              children: { value: { kind: "Binder", children: { name: "app" } } },
            },
            ty: typeName("App"),
          },
        },
        expr: identifier("make_app"),
        body: {
          kind: "Expr::Function",
          loc: { file: "main.mbt", start: { line: 4, column: 3 }, end: { line: 7, column: 4 } },
          children: {
            func: {
              kind: "Func::Lambda",
              children: {
                parameters: {
                  kind: "Func::Lambda::ParameterList",
                  children: [positionalParameter("op", typeName("ActionOp"), 4)],
                },
                body: {
                  kind: "Expr::Apply",
                  loc: { file: "main.mbt", start: { line: 5, column: 5 }, end: { line: 5, column: 16 } },
                  children: {
                    func: identifier("app"),
                    args: {
                      kind: "Expr::Apply::ArgumentList",
                      children: [{ kind: "Argument", children: { value: identifier("op") } }],
                    },
                    attr: { kind: "ApplyAttr::NoAttr", children: {} },
                  },
                },
              },
            },
          },
        },
      },
    };
    const localFunctionLet = {
      kind: "Expr::Let",
      loc: { file: "main.mbt", start: { line: 10, column: 3 }, end: { line: 14, column: 4 } },
      children: {
        pattern: {
          kind: "Pattern::Var",
          children: { value: { kind: "Binder", children: { name: "callback" } } },
        },
        expr: {
          kind: "Expr::Function",
          loc: { file: "main.mbt", start: { line: 10, column: 18 }, end: { line: 12, column: 4 } },
          children: {
            func: {
              kind: "Func::Lambda",
              children: {
                parameters: {
                  kind: "Func::Lambda::ParameterList",
                  children: [positionalParameter("value", typeName("Int"), 10)],
                },
                body: identifier("value"),
              },
            },
          },
        },
        body: {
          kind: "Expr::Apply",
          loc: { file: "main.mbt", start: { line: 13, column: 3 }, end: { line: 13, column: 14 } },
          children: {
            func: identifier("callback"),
            args: { kind: "Expr::Apply::ArgumentList", children: [] },
            attr: { kind: "ApplyAttr::NoAttr", children: {} },
          },
        },
      },
    };
    const files = [{
      id: "file:0",
      path: "main.mbt",
      package: ".",
      dependency: false,
      source: "// Viewer state used by callbacks.\nlet app : App = make_app()\n",
      ast: [
        functionDefinition("main", typedLet),
        functionDefinition("with_local_function", localFunctionLet),
        functionDefinition("unrelated", identifier("op")),
      ],
    }];
    const program = buildProgram(files, root);
    const localApp = program.definitions.find((definition) => definition.name === "app");
    const localOp = program.definitions.find((definition) => definition.name === "op");
    assert.equal(localApp.kind, "binding");
    assert.equal(localApp.ast.type, "App");
    assert.equal(localApp.ast.doc, "Viewer state used by callbacks.");
    assert.equal(localOp.kind, "parameter");
    assert.equal(localOp.ast.type, "ActionOp");
    const lambda = program.entry.ast.children[0].children[1];
    assert.equal(lambda.children[0].targetId, localApp.id);
    assert.equal(lambda.children[0].children[0].targetId, localOp.id);
    const callback = program.definitions.find((definition) => definition.name === "callback");
    assert.equal(callback.kind, "local-function");
    assert.equal(callback.ast.localFunction, true);
    assert.equal(callback.ast.type, "(Int) -> _");
    const withLocalFunction = program.definitions.find((definition) =>
      definition.name === "with_local_function"
    );
    assert.equal(withLocalFunction.ast.children[0].children[1].targetId, callback.id);
    const unrelated = program.definitions.find((definition) => definition.name === "unrelated");
    assert.equal(unrelated.ast.children[0].targetId, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildProgram starts at executable main and links simplified calls", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monastry-program-"));
  try {
    fs.mkdirSync(path.join(root, "app"));
    fs.writeFileSync(path.join(root, "app", "moon.pkg"), 'pkgtype(kind: "executable")\n');
    const callRunApp = {
      kind: "Expr::Apply",
      children: {
        func: identifier("run_app"),
        args: {
          kind: "Expr::Apply::ArgumentList",
          children: [
            {
              kind: "Argument",
              children: { value: identifier("run_app") },
            },
            {
              kind: "Argument",
              children: { value: identifier("style_counter") },
            },
            {
              kind: "Argument",
              children: {
                value: {
                  kind: "Expr::Apply",
                  children: {
                    func: identifier("DataLoaded"),
                    args: { kind: "Expr::Apply::ArgumentList", children: [] },
                    attr: { kind: "ApplyAttr::NoAttr", children: {} },
                  },
                },
              },
            },
            {
              kind: "Argument",
              children: { value: identifier("ActionOp") },
            },
            {
              kind: "Argument",
              children: {
                value: {
                  kind: "Expr::Apply",
                  children: {
                    func: identifier("default"),
                    args: { kind: "Expr::Apply::ArgumentList", children: [] },
                    attr: { kind: "ApplyAttr::NoAttr", children: {} },
                  },
                },
              },
            },
          ],
        },
        attr: { kind: "ApplyAttr::NoAttr", children: {} },
      },
    };
    const letWindow = {
      kind: "Expr::Let",
      children: {
        pattern: {
          kind: "Pattern::Var",
          children: { value: { kind: "Binder", children: { name: "window" } } },
        },
        expr: identifier("dom.window"),
        body: {
          kind: "Expr::Apply",
          children: {
            func: identifier("window"),
            args: { kind: "Expr::Apply::ArgumentList", children: [] },
            attr: { kind: "ApplyAttr::NoAttr", children: {} },
          },
        },
      },
    };
    const files = [{
      id: "file:0",
      path: "app/main.mbt",
      package: "app",
      dependency: false,
      ast: [
        functionDefinition("run_app", letWindow),
        functionDefinition("main", callRunApp),
        topBinding("style_counter", identifier("react.static_style")),
        variantDefinition("ActionOp", "Operations accepted by the store.", [
          ["DataLoaded", ["Json"]],
          ["Reset", []],
        ]),
        implementationDefinition("default", identifier("Store")),
      ],
    }];
    const program = buildProgram(files, root);
    assert.equal(program.entry.name, "main");
    assert.equal(program.entry.executable, true);
    assert.equal(program.entry.ast.kind, "Function");
    assert.equal(program.entry.ast.type, "() -> Unit");
    assert.equal(program.entry.ast.doc, "Application entry");
    assert.equal(program.entry.ast.children[0].kind, "Call");
    assert.equal(program.entry.ast.children[0].name, "run_app");
    assert.equal(program.entry.ast.children[0].targetId, program.definitions[0].id);
    assert.equal(program.entry.ast.children[0].children[0].targetId, program.definitions[0].id);
    const topStyle = program.definitions.find((definition) => definition.kind === "top-binding");
    assert.equal(topStyle.name, "style_counter");
    assert.equal(topStyle.ast.kind, "Binding");
    assert.equal(topStyle.ast.children[0].name, "react.static_style");
    assert.equal(files[0].astView[2].targetId, topStyle.id);
    assert.equal(program.entry.ast.children[0].children[1].targetId, topStyle.id);
    assert.equal(program.entry.ast.children[0].children[1].targetScope, undefined);
    const actionType = program.definitions.find((definition) => definition.kind === "type");
    assert.equal(actionType.name, "ActionOp");
    assert.deepEqual(actionType.aliases, ["DataLoaded", "Reset"]);
    assert.equal(actionType.ast.doc, "Operations accepted by the store.");
    assert.equal(actionType.ast.type, "enum ActionOp { DataLoaded(Json) | Reset }");
    assert.equal(findSimplified(program.entry.ast, "DataLoaded").targetId, actionType.id);
    assert.equal(findSimplified(program.entry.ast, "ActionOp").targetId, actionType.id);
    const defaultMethod = program.definitions.find((definition) => definition.kind === "method");
    assert.equal(defaultMethod.name, "default");
    assert.equal(defaultMethod.ast.type, "Default for Store · () -> Store");
    assert.equal(defaultMethod.ast.doc, "Construct the initial store.");
    assert.equal(findSimplified(program.entry.ast, "default").targetId, defaultMethod.id);
    assert.equal(program.definitions[0].ast.children[0].kind, "Let");
    assert.equal(program.definitions[0].ast.children[0].name, "window");
    assert.equal(program.definitions[0].ast.children[0].children.some((node) => node.kind.endsWith("Pattern")), false);
    const localWindow = program.definitions.find((definition) => definition.kind === "binding");
    assert.equal(localWindow.name, "window");
    assert.equal(localWindow.ast.children.length, 1);
    assert.equal(localWindow.ast.children[0].name, "dom.window");
    assert.equal(localWindow.ast.scope, "local");
    assert.equal(program.definitions[0].ast.children[0].children[1].targetId, localWindow.id);
    assert.equal(program.definitions[0].ast.children[0].children[1].targetScope, "local");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
