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
  ["Impl::TopImpl", "Implementation"],
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
  if (node.kind === "Pattern::Constraint" || node.kind === "Pattern::Alias") {
    return patternName(value.pat ?? value.pattern ?? value.value) ??
      longIdent(value.binder ?? value.alias);
  }
  return longIdent(node);
}

function patternType(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  return typeText(value.ty) ??
    patternType(value.pat ?? value.pattern ?? value.value);
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

function cleanDocumentation(value) {
  if (typeof value !== "string") return undefined;
  const documentation = value.trim();
  return documentation || undefined;
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
  if (value.kind.startsWith("TrailingMark::") || value.kind.startsWith("Trailing::")) return [];
  if (value.kind === "Comma" || value.kind === "Brace" || value.kind.startsWith("Group::")) return [];
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
    ...(parameters.length > 0 ? { bindings: parameters } : {}),
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
  const ownerType = longIdent(declarationChildren.type_name);
  const body = at(node, "children", "decl_body", "children", "expr");
  const documentation = cleanDocumentation(declarationChildren.doc);
  return {
    kind: "Function",
    name,
    type: signature,
    ...(ownerType ? { ownerType } : {}),
    ...(documentation ? { doc: documentation } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: [
      ...parameters,
      ...normalizeChildren(body, "body", { ...context, functionName: name }),
    ],
  };
}

function typeParameterText(node) {
  return longIdent(node) ??
    at(node, "children", "name") ??
    at(node, "children", "binder", "children", "name");
}

function fieldDeclarationText(node) {
  const value = children(node);
  const name = at(value, "name", "children", "label") ?? longIdent(value.name) ?? "field";
  return `${name}: ${typeText(value.ty) ?? "_"}`;
}

function constructorDeclarationText(node) {
  const value = children(node);
  const name = longIdent(value.name) ?? "Constructor";
  const args = listChildren(value.args).map((item) => typeText(children(item).ty) ?? "_");
  return args.length === 0 ? name : `${name}(${args.join(", ")})`;
}

function typeDefinitionSignature(value) {
  const name = value.tycon ?? "anonymous";
  const params = listChildren(value.params).map(typeParameterText).filter(Boolean);
  const named = params.length === 0 ? name : `${name}[${params.join(", ")}]`;
  const components = value.components;
  if (components?.kind === "TypeDesc::Record") {
    const fields = listChildren(at(components, "children", "value"))
      .map(fieldDeclarationText);
    return `struct ${named} { ${fields.join(", ")} }`;
  }
  if (components?.kind === "TypeDesc::Variant") {
    const constructors = listChildren(at(components, "children", "value"))
      .map(constructorDeclarationText);
    return `enum ${named} { ${constructors.join(" | ")} }`;
  }
  return `type ${named}`;
}

function typeDefinitionNode(node, context) {
  const declaration = at(node, "children", "value") ?? {};
  const value = children(declaration);
  const documentation = cleanDocumentation(value.doc);
  const normalized = {
    kind: "TypeDefinition",
    name: value.tycon ?? "anonymous",
    type: typeDefinitionSignature(value),
    ...(documentation ? { doc: documentation } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizeChildren(value.components, "body", context),
  };
  if (normalized.children.length === 0) delete normalized.children;
  return normalized;
}

function implementationNode(node, context) {
  const value = children(node);
  const name = longIdent(value.method_name) ?? "implementation";
  const trait = longIdent(value.trait);
  const selfType = typeText(value.self_ty);
  const parameters = listChildren(value.params).map(parameterNode);
  const returnType = typeText(value.ret_ty) ?? "Unit";
  const owner = [trait, selfType].filter(Boolean).join(" for ");
  const signature = `${owner ? `${owner} · ` : ""}(${parameters
    .map((item) => item.type ?? "_")
    .join(", ")}) -> ${returnType}`;
  const body = at(value, "body", "children", "expr");
  const documentation = cleanDocumentation(value.doc);
  return {
    kind: "Implementation",
    name,
    type: signature,
    ...(documentation ? { doc: documentation } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: [
      ...parameters,
      ...normalizeChildren(body, "body", { ...context, functionName: name }),
    ],
  };
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

function fieldPath(node) {
  if (!node || typeof node !== "object") return undefined;
  if (node.kind === "Expr::Ident") {
    const baseName = expressionName(node);
    return baseName ? { text: baseName, baseName } : undefined;
  }
  if (node.kind !== "Expr::Field") return undefined;
  const value = children(node);
  const record = fieldPath(value.record);
  const accessor = longIdent(at(value, "accessor", "children", "value")) ??
    longIdent(value.accessor);
  if (!record || !accessor) return undefined;
  return { text: `${record.text}.${accessor}`, baseName: record.baseName };
}

function compactExpressionText(node) {
  if (!node || typeof node !== "object") return undefined;
  const value = children(node);
  if (node.kind === "Expr::Ident" || node.kind === "Expr::Constr") {
    return expressionName(node);
  }
  if (node.kind === "Expr::Constant") {
    const scalar = scalarSummary(node);
    return value.constant?.kind === "Constant::String"
      ? JSON.stringify(scalar)
      : scalar == null ? undefined : String(scalar);
  }
  if (node.kind === "Expr::Field") return fieldPath(node)?.text;
  if (node.kind === "Expr::Apply") {
    const name = expressionName(value.func);
    const args = listChildren(value.args).map((argument) =>
      compactExpressionText(children(argument).value)
    );
    if (!name) return undefined;
    return `${name}(${args.every(Boolean) ? args.join(", ") : "…"})`;
  }
  if (node.kind === "Expr::DotApply") {
    const receiver = compactExpressionText(value.self);
    const method = longIdent(value.method_name);
    const args = listChildren(value.args).map((argument) =>
      compactExpressionText(children(argument).value)
    );
    if (!receiver || !method) return undefined;
    return `${receiver}.${method}(${args.every(Boolean) ? args.join(", ") : "…"})`;
  }
  return undefined;
}

function fieldAccessNode(node, role) {
  const path = fieldPath(node);
  if (!path) return undefined;
  return {
    kind: "FieldAccess",
    ...(role ? { role: roleName(role) } : {}),
    name: path.text,
    referenceName: path.baseName,
    segments: accessSegments(node),
    ...(node.loc ? { loc: node.loc } : {}),
  };
}

function accessSegments(node) {
  if (!node || typeof node !== "object") return [];
  const value = children(node);
  if (node.kind === "Expr::Ident") {
    const name = longIdent(node);
    return name
      ? [{ kind: "Identifier", name, referenceName: name, ...(node.loc ? { loc: node.loc } : {}) }]
      : [];
  }
  if (node.kind === "Expr::Field") {
    const base = accessSegments(value.record);
    const name = longIdent(at(value, "accessor", "children", "value")) ??
      longIdent(value.accessor);
    return name
      ? [...base, { kind: "FieldSegment", name, referenceName: name, ...(node.loc ? { loc: node.loc } : {}) }]
      : base;
  }
  if (node.kind === "Expr::DotApply") {
    const base = accessSegments(value.self);
    const method = longIdent(value.method_name);
    const args = listChildren(value.args).map((argument) =>
      compactExpressionText(children(argument).value)
    );
    if (!method) return base;
    const name = `${method}(${args.every(Boolean) ? args.join(", ") : "…"})`;
    return [...base, {
      kind: "MethodSegment",
      name,
      referenceName: method,
      ...(node.loc ? { loc: node.loc } : {}),
    }];
  }
  const name = compactExpressionText(node);
  return name ? [{ kind: "ValueSegment", name, ...(node.loc ? { loc: node.loc } : {}) }] : [];
}

function dotApplyNode(node, role, context) {
  const value = children(node);
  const receiver = compactExpressionText(value.self) ?? "value";
  const method = longIdent(value.method_name) ?? "method";
  const rawArguments = listChildren(value.args);
  const detailedArguments = rawArguments.filter((argument) => {
    const expression = children(argument).value;
    return expression?.kind !== "Expr::Constant";
  });
  const normalizedArguments = detailedArguments.flatMap((argument) =>
    normalizeChildren(argument, "args", context),
  );
  const inlineArguments = rawArguments.map((argument) =>
    compactExpressionText(children(argument).value),
  );
  const name = normalizedArguments.length === 0 && inlineArguments.every(Boolean)
    ? `${receiver}.${method}(${inlineArguments.join(", ")})`
    : `${receiver}.${method}`;
  const result = {
    kind: "MethodCall",
    ...(role ? { role: roleName(role) } : {}),
    name,
    referenceName: method,
    segments: accessSegments(node),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizedArguments,
  };
  if (result.children.length === 0) delete result.children;
  return result;
}

function mutationNode(node, role, context) {
  const value = children(node);
  const record = fieldPath(value.record);
  const accessor = longIdent(at(value, "accessor", "children", "value")) ??
    longIdent(value.accessor);
  const name = record && accessor ? `${record.text}.${accessor}` : "field";
  const result = {
    kind: "Mutation",
    ...(role ? { role: roleName(role) } : {}),
    name,
    ...(record?.baseName ? { referenceName: record.baseName } : {}),
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizeChildren(value.field, "value", context),
  };
  if (result.children.length === 0) delete result.children;
  return result;
}

function recordFieldNode(node, role, context) {
  const value = children(node);
  const name = longIdent(value.label) ?? "field";
  const result = {
    kind: "RecordField",
    ...(role ? { role: roleName(role) } : {}),
    name,
    ...(node.loc ? { loc: node.loc } : {}),
    children: normalizeChildren(value.expr, "value", context),
  };
  if (result.children.length === 0) delete result.children;
  return result;
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
  if (node.kind === "Impl::TopImpl") return implementationNode(node, context);
  if (node.kind === "Expr::Function" || node.kind === "Func::Lambda") {
    return lambdaNode(node, role, context);
  }
  if (node.kind === "Expr::Interp") return interpolationNode(node, role);
  if (node.kind === "Expr::Infix") return infixNode(node, role, context);
  if (node.kind === "Expr::Field") {
    const compact = fieldAccessNode(node, role);
    if (compact) return compact;
    const fallback = {
      kind: "FieldAccess",
      ...(role ? { role: roleName(role) } : {}),
      ...(node.loc ? { loc: node.loc } : {}),
      children: Object.entries(children(node)).flatMap(([key, item]) =>
        normalizeChildren(item, key, context)
      ),
    };
    if (fallback.children.length === 0) delete fallback.children;
    return fallback;
  }
  if (node.kind === "Expr::DotApply") return dotApplyNode(node, role, context);
  if (node.kind === "Expr::Mutate") return mutationNode(node, role, context);
  if (node.kind === "FieldDef") return recordFieldNode(node, role, context);
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
  const explicitType = typeText(value.ty) ??
    (node.kind === "Expr::Let" ? patternType(value.pattern) : undefined);
  if (name) result.name = name;
  if (scalar != null) result.value = String(scalar);
  if (explicitType) result.type = explicitType;
  const documentation = cleanDocumentation(value.doc);
  if (documentation) result.doc = documentation;

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

function nestedNames(node, kind, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.kind === kind && node.name) result.push(node.name);
  for (const child of node.children ?? []) nestedNames(child, kind, result);
  return result;
}

function leadingDocumentation(source, line) {
  if (!source || !Number.isInteger(line) || line <= 1) return undefined;
  const lines = source.split(/\r?\n/);
  const docs = [];
  for (let index = line - 2; index >= 0; index -= 1) {
    const sourceLine = lines[index];
    if (sourceLine == null) break;
    const text = sourceLine.trim();
    if (text === "///|") break;
    if (text.startsWith("///")) {
      docs.unshift(text.slice(3).trimStart());
      continue;
    }
    if (text.startsWith("//")) {
      docs.unshift(text.slice(2).trimStart());
      continue;
    }
    break;
  }
  const documentation = docs.join("\n").trim();
  return documentation || undefined;
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

const localDefinitionKinds = new Set([
  "binding",
  "local-function",
  "parameter",
  "pattern",
]);

function positionInScope(position, scope) {
  if (!position || !scope?.start || !scope?.end) return true;
  const afterStart = position.line > scope.start.line ||
    (position.line === scope.start.line && position.column >= scope.start.column);
  const beforeEnd = position.line < scope.end.line ||
    (position.line === scope.end.line && position.column <= scope.end.column);
  return afterStart && beforeEnd;
}

function localId(prefix, owner, node, name) {
  const line = node.loc?.start?.line ?? 0;
  const column = node.loc?.start?.column ?? 0;
  return `${prefix}:${owner.id}:${line}:${column}:${name}`;
}

function collectLocalDefinitions(
  node,
  owner,
  definitions,
  source,
  inheritedScope = owner.ast.loc,
) {
  if (!node || typeof node !== "object") return;
  const introducesScope = node.kind === "Function" ||
    node.kind === "Implementation" ||
    node.kind === "Lambda" ||
    node.kind === "Case";
  const nodeScope = introducesScope && node.loc ? node.loc : inheritedScope;
  if (node.kind === "Let" && node.name) {
    const line = node.loc?.start?.line ?? 0;
    const id = localId("local", owner, node, node.name);
    const initializer = (node.children ?? []).filter((child) => child.role === "expr");
    const lambda = initializer.find((child) => child.kind === "Lambda");
    const localFunction = lambda != null;
    const localFunctionType = localFunction
      ? `(${(lambda.bindings ?? []).map((binding) => binding.type ?? "_").join(", ")}) -> _`
      : undefined;
    const end = initializer.at(-1)?.loc?.end ?? node.loc?.end;
    const documentation = cleanDocumentation(node.doc) ?? leadingDocumentation(source, line);
    node.scope = "local";
    node.targetScope = "local";
    if (localFunction) {
      node.localFunction = true;
      if (!node.type) node.type = localFunctionType;
    }
    const ast = {
      ...node,
      ...(documentation ? { doc: documentation } : {}),
      ...(node.loc ? { loc: { ...node.loc, ...(end ? { end } : {}) } } : {}),
      children: initializer,
    };
    delete ast.targetId;
    if (ast.children.length === 0) delete ast.children;
    node.definitionId = id;
    node.targetId = id;
    definitions.push({
      id,
      kind: localFunction ? "local-function" : "binding",
      ownerId: owner.id,
      name: node.name,
      fileId: owner.fileId,
      path: owner.path,
      package: owner.package,
      dependency: owner.dependency,
      line,
      scope: node.loc ?? nodeScope,
      ast,
    });
  } else if (node.kind === "Parameter" && node.name && node.name !== "_") {
    const line = node.loc?.start?.line ?? 0;
    const id = localId("parameter", owner, node, node.name);
    node.scope = "local";
    node.targetScope = "local";
    node.definitionId = id;
    node.targetId = id;
    definitions.push({
      id,
      kind: "parameter",
      ownerId: owner.id,
      name: node.name,
      fileId: owner.fileId,
      path: owner.path,
      package: owner.package,
      dependency: owner.dependency,
      line,
      scope: nodeScope,
      ast: { ...node },
    });
  } else if (node.kind === "VarPattern" && node.name && node.name !== "_") {
    const line = node.loc?.start?.line ?? 0;
    const id = localId("pattern", owner, node, node.name);
    node.scope = "local";
    node.targetScope = "local";
    node.definitionId = id;
    node.targetId = id;
    definitions.push({
      id,
      kind: "pattern",
      ownerId: owner.id,
      name: node.name,
      fileId: owner.fileId,
      path: owner.path,
      package: owner.package,
      dependency: owner.dependency,
      line,
      scope: nodeScope,
      ast: { ...node },
    });
  }
  const childScope = node.kind === "Let" && node.loc ? node.loc : nodeScope;
  for (const binding of node.bindings ?? []) {
    collectLocalDefinitions(binding, owner, definitions, source, childScope);
  }
  for (const child of node.children ?? []) {
    collectLocalDefinitions(child, owner, definitions, source, childScope);
  }
}

function linkDeclaredMethod(segment, receiver, definitions, file) {
  // Only use a concrete, explicitly declared receiver type. Generic variables,
  // trait objects and return types of earlier chain segments need the compiler.
  if (receiver?.resolution !== "local" && receiver?.resolution !== "package") return;
  const type = receiver?.symbolType ?? receiver?.type;
  const match = type?.match(/^(?:@?([A-Za-z_][\w/]*)\.)?([A-Za-z_]\w*)(?:\[.*\])?$/);
  if (!match) return;
  const packageDir = match[1]
    ? (Object.hasOwn(file.imports ?? {}, match[1]) ? file.imports[match[1]] : undefined)
    : file.package;
  if (!definitions.some((d) => d.kind === "type" && d.name === match[2] && d.package === packageDir)) return;
  const matches = definitions.filter((d) =>
    d.kind === "function" && d.package === packageDir &&
    d.ast.ownerType === match[2] && d.name === segment.referenceName,
  );
  if (matches.length !== 1) return;
  segment.targetId = matches[0].id;
  segment.symbolType = matches[0].ast.type;
  segment.resolution = "declared-receiver";
  delete segment.candidateIds;
}

function usingImports(files, file) {
  const bindings = [];
  for (const source of files) {
    if (source.package !== file.package) continue;
    if (source.sourceKind === "test" ? file.sourceKind !== "test" : file.sourceKind === "test") continue;
    if (source.sourceKind === "whitebox-test" && file.sourceKind !== "whitebox-test") continue;
    for (const node of source.ast) {
      if (node.kind !== "Impl::TopUsing") continue;
      const value = children(node);
      const alias = longIdent(value.pkg);
      const packageDir = Object.hasOwn(source.imports ?? {}, alias) ? source.imports[alias] : undefined;
      for (const name of listChildren(value.names)) {
        const target = children(children(name).name);
        const localName = longIdent(target.binder);
        if (localName) bindings.push({ localName, name: longIdent(target.target) ?? localName, package: packageDir });
      }
    }
  }
  return bindings;
}

function linkReferences(node, definitions, file, ownerId, usings) {
  if (!node || typeof node !== "object") return;
  const referenceKinds = new Set([
    "Call",
    "Identifier",
    "Constructor",
    "ConstrName",
    "ConstrId",
    "FieldAccess",
    "Ident",
    "Label",
    "MethodCall",
    "MethodSegment",
    "FieldSegment",
    "Mutation",
    "Name",
    "TypeName",
  ]);
  if (referenceKinds.has(node.kind) && node.name) {
    const referenceName = node.referenceName ?? node.name;
    const parts = referenceName.replace(/^@/, "").split(".");
    const qualified = parts.length > 1;
    const leaf = parts.at(-1);
    const currentPackage = file.package;
    const matches = definitions.filter((definition) =>
      definition.name === leaf || (definition.aliases ?? []).includes(leaf),
    );
    const callLine = node.loc?.start?.line ?? Number.MAX_SAFE_INTEGER;
    const localTarget = !qualified && (
      node.kind === "Call" ||
      node.kind === "Identifier" ||
      node.kind === "FieldAccess" ||
      node.kind === "Mutation"
    )
      ? matches
      .filter((definition) =>
        localDefinitionKinds.has(definition.kind) &&
        definition.ownerId === ownerId &&
        definition.line <= callLine &&
        positionInScope(node.loc?.start, definition.scope),
      )
      .sort((left, right) => right.line - left.line)[0]
      : undefined;
    const targetPackage = qualified
      ? (Object.hasOwn(file.imports ?? {}, parts[0]) ? file.imports[parts[0]] : undefined)
      : currentPackage;
    const member = node.kind === "MethodCall" || node.kind === "MethodSegment";
    const field = node.kind === "FieldSegment" || node.kind === "Label";
    const visiblePackages = new Set([currentPackage, ...Object.values(file.imports ?? {})]);
    const usingMatches = qualified ? [] : usings.filter((binding) => binding.localName === leaf);
    const importedDefinitions = usingMatches.length === 0 ? [] : definitions.filter((d) => usingMatches.some((b) =>
      b.package === d.package && (b.name === d.name || (d.aliases ?? []).includes(b.name)),
    ));
    const candidates = [...new Set([...matches, ...importedDefinitions])].filter((definition) =>
      !localDefinitionKinds.has(definition.kind) &&
      (member ? visiblePackages.has(definition.package) : definition.package === targetPackage || importedDefinitions.includes(definition)) &&
      (!ifTypeReference(node.kind) || definition.kind === "type") &&
      (!member || definition.kind === "function" || definition.kind === "method") &&
      !field,
    );
    // A syntax-only adapter cannot establish a field's owner or uniquely
    // dispatch a method. Keep visible method candidates without choosing one.
    const target = localTarget ?? (!member && candidates.length === 1 ? candidates[0] : undefined);
    node.resolution = target
      ? (localTarget ? "local" : qualified ? "import" : importedDefinitions.includes(target) ? "using" : "package")
      : field || member ? "needs-type"
        : qualified && targetPackage === undefined ? "unknown-import"
          : candidates.length > 1 ? "ambiguous"
            : qualified && !definitions.some((definition) => definition.package === targetPackage)
              ? "dependency-not-indexed"
              : usingMatches.length > 0 && importedDefinitions.length === 0 ? "dependency-not-indexed" : "unresolved";
    if (!target && candidates.length > 0) node.candidateIds = candidates.map((candidate) => candidate.id);
    if (target) {
      node.targetId = target.id;
      if (target.ast?.type) node.symbolType = target.ast.type;
      if (localDefinitionKinds.has(target.kind)) {
        node.targetScope = "local";
      }
    }
  }
  for (const child of node.children ?? []) {
    linkReferences(child, definitions, file, ownerId, usings);
  }
  for (const segment of node.segments ?? []) {
    linkReferences(segment, definitions, file, ownerId, usings);
  }
  if (node.segments?.[0]?.kind === "Identifier" && node.segments?.[1]?.kind === "MethodSegment") {
    linkDeclaredMethod(node.segments[1], node.segments[0], definitions, file);
    if (node.kind === "MethodCall" && node.segments.length === 2 && node.segments[1].targetId) {
      node.targetId = node.segments[1].targetId;
      node.symbolType = node.segments[1].symbolType;
      node.resolution = "declared-receiver";
      delete node.candidateIds;
    }
  }
}

function ifTypeReference(kind) {
  return kind === "Constructor" ||
    kind === "ConstrName" ||
    kind === "ConstrId" ||
    kind === "Name" ||
    kind === "TypeName";
}

export function buildProgram(files, project) {
  const definitions = [];
  const topDefinitions = [];
  const rootDefinitions = [];
  for (const file of files) {
    file.astView = file.ast.map((node, index) => {
      const simplified = normalizeNode(node, "", { path: file.path, package: file.package });
      if (!simplified.doc) {
        const documentation = leadingDocumentation(file.source, simplified.loc?.start?.line);
        if (documentation) simplified.doc = documentation;
      }
      if (simplified.kind === "Function") {
        const definition = {
          id: `fn:${file.id}:${index}`,
          kind: "function",
          name: simplified.name,
          fileId: file.id,
          path: file.path,
          package: file.package,
          dependency: file.dependency,
          executable: file.executable ?? manifestIsExecutable(project, file.package),
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
      } else if (simplified.kind === "TypeDefinition" && simplified.name) {
        const definition = {
          id: `type:${file.id}:${index}`,
          kind: "type",
          name: simplified.name,
          aliases: nestedNames(simplified, "ConstrName"),
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
      } else if (simplified.kind === "Implementation" && simplified.name) {
        const definition = {
          id: `method:${file.id}:${index}`,
          kind: "method",
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
    const source = files.find((file) => file.id === definition.fileId)?.source;
    collectLocalDefinitions(definition.ast, definition, definitions, source);
  }
  const importsByFile = new Map(files.map((file) => [file.id, usingImports(files, file)]));
  for (const definition of rootDefinitions) {
    const file = files.find((file) => file.id === definition.fileId);
    linkReferences(definition.ast, definitions, file, definition.id, importsByFile.get(file.id));
  }

  const entries = topDefinitions
    .filter((definition) => definition.name === "main" && !definition.dependency)
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

export const testing = {
  displayKind,
  leadingDocumentation,
  longIdent,
  normalizeNode,
  typeText,
};
import fs from "node:fs";
import path from "node:path";
