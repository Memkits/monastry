import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseArgs } from "../cli/args.mjs";
import { findPackages, findSources, readModuleName } from "../cli/project.mjs";
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

test("simplified AST compacts lambda, interpolation, and binary wrappers", () => {
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
      ],
    }];
    const program = buildProgram(files, root);
    assert.equal(program.entry.name, "main");
    assert.equal(program.entry.executable, true);
    assert.equal(program.entry.ast.kind, "Function");
    assert.equal(program.entry.ast.type, "() -> Unit");
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
