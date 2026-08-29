const ignoredFields = new Set([
  "attrs",
  "attr",
  "doc",
  "error_type",
  "extra_info",
  "has_error",
  "is_async",
  "is_constant",
  "is_declare",
  "local_types",
  "quantifiers",
  "return_type",
  "ty",
  "type_name",
  "type_vis",
  "vis",
  "where_clause",
]);

const kindNames = new Map([
  ["Impl::TopFuncDef", "Function"],
  ["Impl::TopTypeDef", "TypeDefinition"],
  ["Impl::TopLetDef", "Binding"],
  ["Expr::Apply", "Call"],
  ["Expr::Ident", "Identifier"],
  ["Expr::Let", "Let"],
  ["Expr::If", "If"],
  ["Expr::Match", "Match"],
  ["Expr::Sequence", "Sequence"],
  ["Expr::Lambda", "Lambda"],
  ["Expr::Tuple", "Tuple"],
  ["Expr::Array", "Array"],
  ["Expr::Constant", "Constant"],
  ["Expr::Infix", "BinaryOperation"],
  ["Expr::Pipe", "Pipe"],
  ["Expr::Field", "FieldAccess"],
  ["Expr::Constr", "Constructor"],
  ["Expr::Block", "Block"],
  ["Parameter::Positional", "Parameter"],
  ["Parameter::Labelled", "Parameter"],
  ["Parameter::Optional", "Parameter"],
]);

function children(node) {
  return node && typeof node === "object" && node.children && typeof node.children === "object"
    ? node.children
    : {};
}

function at(node, ...keys) {
  let value = node;
  for (const key of keys) value = value && typeof value === "object" ? value[key] : undefined;
  return value;
}

function longIdent(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  switch (node.kind) {
    case "Expr::Ident":
      return longIdent(value.id);
    case "Var":
    case "ConstrId":
    case "TypeName":
      return longIdent(value.name ?? value.id);
    case "LongIdent::Ident":
      return value.value;
    case "LongIdent::Dot": {
      if (typeof value.pkg === "string" && typeof value.id === "string") {
        return `${value.pkg}.${value.id}`;
      }
      const prefix = longIdent(value.prefix ?? value.lhs ?? value.module);
      const suffix = longIdent(value.name ?? value.rhs ?? value.id) ?? value.value;
      return [prefix, suffix].filter(Boolean).join(".") || undefined;
    }
    case "Binder":
    case "ConstrName":
    case "Label":
      return value.name;
    case "Expr::Field": {
      const object = expressionName(value.object ?? value.expr);
      const field = longIdent(value.field) ?? value.field_name;
      return [object, field].filter(Boolean).join(".") || undefined;
    }
    case "Expr::Constr":
      return longIdent(value.constr);
    case "Expr::Method":
      return longIdent(value.method_name ?? value.name);
    case "Constructor":
      return longIdent(value.name);
    default:
      return typeof value.name === "string" ? value.name : undefined;
  }
}

function expressionName(node) {
  return longIdent(node);
}

function typeText(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  switch (node.kind) {
    case "Type::Name": {
      const name = longIdent(value.constr_id) ?? "Type";
      const args = listChildren(value.tys).map(typeText).filter(Boolean);
      return args.length === 0 ? name : `${name}[${args.join(", ")}]`;
    }
    case "Type::Tuple": {
      const items = listChildren(value.tys ?? value.types).map(typeText).filter(Boolean);
      return `(${items.join(", ")})`;
    }
    case "Type::Arrow":
    case "Type::Function": {
      const params = listChildren(value.params ?? value.args).map(typeText).filter(Boolean);
      const result = typeText(value.return_type ?? value.result) ?? "_";
      return `(${params.join(", ")}) -> ${result}`;
    }
    case "Type::Option":
      return `${typeText(value.value ?? value.ty) ?? "_"}?`;
    case "Type::Hole":
      return "_";
    default: {
      const name = longIdent(node);
      if (name) return name;
      if (node.kind?.startsWith("Type::")) return node.kind.slice("Type::".length);
      return undefined;
    }
  }
}

function listChildren(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.children)) return value.children;
  return [];
}

function patternName(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  if (node.kind === "Pattern::Var") return longIdent(value.value);
  if (node.kind === "Pattern::Tuple") {
    const names = listChildren(value.pats).map(patternName).filter(Boolean);
    return `(${names.join(", ")})`;
  }
  return longIdent(node);
}

function scalarSummary(node) {
  const value = children(node);
  if (node.kind?.startsWith("Constant::")) return value.value ?? node.kind.slice("Constant::".length);
  if (node.kind === "Expr::Constant") return scalarSummary(value.constant);
  return undefined;
}

function displayKind(kind = "Node") {
  if (kindNames.has(kind)) return kindNames.get(kind);
  if (kind.startsWith("Pattern::")) return `${kind.slice("Pattern::".length)}Pattern`;
  return kind.split("::").at(-1) || "Node";
}

function isWrapper(node) {
  const kind = node?.kind ?? "";
  return kind.includes("List") ||
    kind === "DeclBody::DeclBody" ||
    kind === "Impl::TopExpr" ||
    kind === "Expr::Sequence";
}

function roleName(role) {
  return role.replaceAll("_", " ");
}

function normalizeChildren(value, role, context) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeChildren(item, role, context));
  if (typeof value !== "object") {
    if (typeof value === "boolean" || value === "") return [];
    return [{ kind: "Value", role: roleName(role), value: String(value) }];
  }
  if (!value.kind) {
    return Object.entries(value).flatMap(([key, item]) =>
      ignoredFields.has(key) ? [] : normalizeChildren(item, key, context),
    );
  }
  if (value.kind === "Argument") {
    const argument = children(value);
    const argumentKind = argument.kind;
    const label = longIdent(children(argumentKind).value);
    if (!label) return normalizeChildren(argument.value, role, context);
  }
  if (isWrapper(value)) {
    const nested = value.children;
    if (Array.isArray(nested)) return nested.flatMap((item) => normalizeChildren(item, role, context));
    if (value.kind === "Expr::Sequence") {
      return Object.values(nested ?? {}).flatMap((item) =>
        normalizeChildren(item, role, context),
      );
    }
    return Object.entries(nested ?? {}).flatMap(([key, item]) =>
      ignoredFields.has(key) ? [] : normalizeChildren(item, key === "expr" ? role : key, context),
    );
  }
  return [normalizeNode(value, role, context)];
}

function parameterNode(node) {
  const value = children(node);
  const name = node.kind === "Parameter::DiscardPositional"
    ? "_"
    : longIdent(value.binder ?? value.label ?? value.name) ?? "parameter";
  const type = typeText(value.ty);
  return {
    kind: "Parameter",
    name,
    ...(type ? { type } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
  };
}

function lambdaNode(node, role, context) {
  const lambda = node.kind === "Expr::Function" ? children(node).func : node;
  const value = children(lambda);
  const parameters = listChildren(value.parameters).map(parameterNode);
  const parameterText = parameters.map((item) => item.name).join(", ");
  return {
    kind: "Lambda",
    ...(role ? { role: roleName(role) } : {}),
    ...(parameterText ? { value: parameterText } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizeChildren(value.body, "body", context),
  };
}

function functionNode(node, context) {
  const declaration = at(node, "children", "fun_decl") ?? {};
  const declarationChildren = children(declaration);
  const name = longIdent(declarationChildren.name) ?? "anonymous";
  const parameters = listChildren(declarationChildren.decl_params).map(parameterNode);
  const returnType = typeText(declarationChildren.return_type) ?? "Unit";
  const signature = `(${parameters.map((item) => item.type ?? "_").join(", ")}) -> ${returnType}`;
  const body = at(node, "children", "decl_body", "children", "expr");
  return {
    kind: "Function",
    name,
    type: signature,
    ...(declarationChildren.doc ? { doc: declarationChildren.doc } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: [
      ...parameters,
      ...normalizeChildren(body, "body", { ...context, functionName: name }),
    ],
  };
}

function typeDefinitionNode(node, context) {
  const declaration = at(node, "children", "value") ?? {};
  const value = children(declaration);
  const normalized = {
    kind: "TypeDefinition",
    name: value.tycon ?? "anonymous",
    ...(value.doc ? { doc: value.doc } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizeChildren(value.components, "body", context),
  };
  if (normalized.children.length === 0) delete normalized.children;
  return normalized;
}

function argumentNode(node, role, context) {
  const value = children(node);
  const argumentKind = value.kind;
  const label = longIdent(children(argumentKind).value);
  const normalizedChildren = normalizeChildren(value.value, "value", context);
  if (label && normalizedChildren.length === 1) {
    const child = normalizedChildren[0];
    return {
      ...child,
      role: roleName(role),
      label,
      ...(node.loc ? { loc: node.loc } : {}),
    };
  }
  const normalized = {
    kind: "Argument",
    role: roleName(role),
    ...(label ? { name: label } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizedChildren,
  };
  if (normalized.children.length === 0) delete normalized.children;
  return normalized;
}

function compactRawExpression(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  if (node.kind === "Expr::Ident") return expressionName(node);
  if (node.kind === "Expr::Constant") return scalarSummary(node);
  if (node.kind === "Expr::Constr") return expressionName(node);
  if (node.kind === "InterpElem::Literal") return value.repr;
  if (node.kind === "InterpElem::Source") return `{${value.source ?? "…"}}`;
  return undefined;
}

function interpolationNode(node, role) {
  const items = listChildren(children(node).elems);
  const text = items.map(compactRawExpression).filter((item) => item != null).join("");
  return {
    kind: "Interp",
    ...(role ? { role: roleName(role) } : {}),
    value: JSON.stringify(text),
    ...(node.loc ? { loc: node.loc } : {}),
  };
}

function infixNode(node, role, context) {
  const value = children(node);
  const lhs = compactRawExpression(value.lhs);
  const op = expressionName(value.op);
  const rhs = compactRawExpression(value.rhs);
  if (lhs && op && rhs) {
    return {
      kind: "BinaryOperation",
      ...(role ? { role: roleName(role) } : {}),
      value: `${lhs} ${op} ${rhs}`,
      ...(node.loc ? { loc: node.loc } : {}),
    };
  }
  const result = {
    kind: "BinaryOperation",
    ...(role ? { role: roleName(role) } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: Object.entries(value).flatMap(([key, item]) =>
      normalizeChildren(item, key, context),
    ),
  };
  if (result.children.length === 0) delete result.children;
  return result;
}

function normalizeNode(node, role, context) {
  if (node.kind === "Impl::TopFuncDef") return functionNode(node, context);
  if (node.kind === "Impl::TopTypeDef") return typeDefinitionNode(node, context);
  if (node.kind === "Expr::Function" || node.kind === "Func::Lambda") {
    return lambdaNode(node, role, context);
  }
  if (node.kind === "Expr::Interp") return interpolationNode(node, role);
  if (node.kind === "Expr::Infix") return infixNode(node, role, context);
  if (node.kind?.startsWith("Parameter::")) return parameterNode(node);
  if (node.kind === "Argument") return argumentNode(node, role, context);

  const value = children(node);
  const result = {
    kind: displayKind(node.kind),
    ...(role ? { role: roleName(role) } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
  };
  let name;
  if (node.kind === "Impl::TopTypeDef") name = at(node, "children", "value", "children", "tycon");
  else if (node.kind === "Impl::TopLetDef") name = longIdent(value.binder);
  else if (node.kind === "Expr::Let") name = patternName(value.pattern);
  else if (node.kind === "Expr::Apply") name = expressionName(value.func);
  else if (node.kind?.startsWith("Pattern::")) name = patternName(node);
  else name = longIdent(node);
  const scalar = scalarSummary(node);
  const explicitType = typeText(value.ty);
  if (name) result.name = name;
  if (scalar != null) result.value = String(scalar);
  if (explicitType) result.type = explicitType;

  const entries = Object.entries(value).filter(([key]) => !ignoredFields.has(key));
  const normalizedChildren = entries.flatMap(([key, item]) => {
    if (node.kind === "Expr::Apply" && key === "func" && name) return [];
    if (node.kind === "Expr::Let" && key === "pattern" && name) return [];
    if (node.kind === "Impl::TopLetDef" && key === "binder" && name) return [];
    if (node.kind?.startsWith("Pattern::") && name) return [];
    if (node.kind === "Expr::Constant" && key === "constant") return [];
    if (name && ["Expr::Ident", "Var", "Binder", "ConstrName", "Constructor", "LongIdent::Ident", "LongIdent::Dot"].includes(node.kind)) return [];
    return normalizeChildren(item, key, context);
  });
  if (normalizedChildren.length > 0) result.children = normalizedChildren;
  return result;
}

function manifestIsExecutable(project, packageName) {
  const packageDir = packageName === "." ? project : path.join(project, packageName);
  try {
    const textManifest = path.join(packageDir, "moon.pkg");
    if (fs.existsSync(textManifest) && /pkgtype\s*\(\s*kind\s*:\s*"executable"/.test(fs.readFileSync(textManifest, "utf8"))) return true;
    const jsonManifest = path.join(packageDir, "moon.pkg.json");
    if (fs.existsSync(jsonManifest)) {
      const manifest = JSON.parse(fs.readFileSync(jsonManifest, "utf8"));
      return manifest["is-main"] === true || manifest.isMain === true || manifest.kind === "executable";
    }
  } catch {
    return false;
  }
  return false;
}

function collectLocalDefinitions(node, owner, definitions) {
  if (!node || typeof node !== "object") return;
  if (node.kind === "Let" && node.name) {
    const line = node.loc?.start?.line ?? 0;
    const id = `local:${owner.fileId}:${line}:${node.name}`;
    const initializer = (node.children ?? []).filter((child) => child.role === "expr");
    const end = initializer.at(-1)?.loc?.end ?? node.loc?.end;
    node.scope = "local";
    node.targetScope = "local";
    const ast = {
      ...node,
      ...(node.loc ? { loc: { ...node.loc, ...(end ? { end } : {}) } } : {}),
      children: initializer,
    };
    delete ast.targetId;
    if (ast.children.length === 0) delete ast.children;
    node.definitionId = id;
    node.targetId = id;
    definitions.push({
      id,
      kind: "binding",
      ownerId: owner.id,
      name: node.name,
      fileId: owner.fileId,
      path: owner.path,
      package: owner.package,
      dependency: owner.dependency,
      line,
      ast,
    });
  }
  for (const child of node.children ?? []) collectLocalDefinitions(child, owner, definitions);
}

function linkReferences(node, definitions, currentPackage, ownerId) {
  if (!node || typeof node !== "object") return;
  if ((node.kind === "Call" || node.kind === "Identifier") && node.name) {
    const leaf = node.name.split(".").at(-1);
    const matches = definitions.filter((definition) => definition.name === leaf);
    const callLine = node.loc?.start?.line ?? Number.MAX_SAFE_INTEGER;
    const localTarget = matches
      .filter((definition) =>
        definition.kind === "binding" &&
        definition.ownerId === ownerId &&
        definition.line <= callLine,
      )
      .sort((left, right) => right.line - left.line)[0];
    const functionMatches = matches.filter((definition) => definition.kind === "function");
    const topBindingMatches = matches.filter((definition) => definition.kind === "top-binding");
    const target = localTarget ??
      topBindingMatches.find((definition) => definition.package === currentPackage) ??
      functionMatches.find((definition) =>
        definition.kind === "function" && definition.package === currentPackage,
      ) ??
      (topBindingMatches.length === 1 ? topBindingMatches[0] : undefined) ??
      (functionMatches.length === 1 ? functionMatches[0] : undefined);
    if (target) {
      node.targetId = target.id;
      if (target.kind === "binding") node.targetScope = "local";
    }
  }
  for (const child of node.children ?? []) {
    linkReferences(child, definitions, currentPackage, ownerId);
  }
}

export function buildProgram(files, project) {
  const definitions = [];
  const topDefinitions = [];
  const rootDefinitions = [];
  for (const file of files) {
    file.astView = file.ast.map((node, index) => {
      const simplified = normalizeNode(node, "", { path: file.path, package: file.package });
      if (simplified.kind === "Function") {
        const definition = {
          id: `fn:${file.id}:${index}`,
          kind: "function",
          name: simplified.name,
          fileId: file.id,
          path: file.path,
          package: file.package,
          dependency: file.dependency,
          executable: manifestIsExecutable(project, file.package),
          ast: simplified,
        };
        simplified.definitionId = definition.id;
        definitions.push(definition);
        topDefinitions.push(definition);
        rootDefinitions.push(definition);
      } else if (simplified.kind === "Binding" && simplified.name) {
        const definition = {
          id: `binding:${file.id}:${index}`,
          kind: "top-binding",
          name: simplified.name,
          fileId: file.id,
          path: file.path,
          package: file.package,
          dependency: file.dependency,
          ast: { ...simplified },
        };
        simplified.definitionId = definition.id;
        simplified.targetId = definition.id;
        definitions.push(definition);
        rootDefinitions.push(definition);
      }
      return simplified;
    });
  }
  for (const definition of rootDefinitions) {
    collectLocalDefinitions(definition.ast, definition, definitions);
  }
  for (const definition of rootDefinitions) {
    linkReferences(definition.ast, definitions, definition.package, definition.id);
  }

  const entries = topDefinitions
    .filter((definition) => definition.name === "main")
    .sort((left, right) =>
      Number(right.executable) - Number(left.executable) ||
      Number(left.dependency) - Number(right.dependency) ||
      left.path.localeCompare(right.path),
    );
  const entry = entries[0] ?? null;
  return {
    entryId: entry?.id ?? null,
    entry,
    entries: entries.map(({ id, name, fileId, path, package: packageName }) => ({
      id,
      name,
      fileId,
      path,
      package: packageName,
    })),
    definitions,
  };
}

export const testing = { displayKind, longIdent, normalizeNode, typeText };
import fs from "node:fs";
import path from "node:path";
