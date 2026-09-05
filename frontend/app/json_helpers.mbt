///|
fn json_field(value : Json, key : String) -> Json? {
  match value {
    Object(fields) => fields.get(key)
    _ => None
  }
}

///|
fn json_string(value : Json?, fallback : String) -> String {
  match value {
    Some(String(text)) => text
    _ => fallback
  }
}

///|
fn json_array(value : Json?) -> Array[Json] {
  match value {
    Some(Array(items)) => items
    _ => []
  }
}

///|
fn json_path(value : Json, keys : Array[String]) -> Json? {
  let mut current = Some(value)
  for key in keys {
    current = match current {
      Some(item) => json_field(item, key)
      None => None
    }
  }
  current
}

///|
fn node_name(value : Json, kind : String) -> String? {
  match json_field(value, "name") {
    Some(String(name)) => return Some(name)
    _ => ()
  }
  let path = match kind {
    "Impl::TopFuncDef" =>
      ["children", "fun_decl", "children", "name", "children", "name"]
    "Impl::TopTypeDef" => ["children", "value", "children", "tycon"]
    "FunDecl" => ["children", "name", "children", "name"]
    "TypeDecl" => ["children", "tycon"]
    "Binder" | "ConstrName" => ["children", "name"]
    "LongIdent::Ident" => ["children", "value"]
    _ => []
  }
  match json_path(value, path) {
    Some(String(name)) => Some(name)
    _ => None
  }
}

///|
fn compact_scalar(value : Json) -> String {
  match value {
    Null => "null"
    True => "true"
    False => "false"
    Number(number, ..) => number.to_string()
    String(text) => text
    Array(items) => "[…] \{items.length()} items"
    Object(fields) => "{…} \{fields.length()} fields"
  }
}

///|
fn node_title(value : Json, fallback : String) -> String {
  let kind = json_string(json_field(value, "kind"), fallback)
  let scalar = json_string(json_field(value, "value"), "")
  match node_name(value, kind) {
    Some(name) => kind + "  " + name
    None if !scalar.is_empty() => kind + "  " + scalar
    None => kind
  }
}

///|
fn node_code(value : Json, fallback : String) -> String {
  let kind = json_string(json_field(value, "kind"), fallback)
  let name = json_string(json_field(value, "name"), "")
  let scalar = json_string(json_field(value, "value"), "")
  let label = json_string(json_field(value, "label"), "")
  let base = match kind {
    "Function" => "fn " + name
    "Implementation" => "impl " + name
    "TypeDefinition" => "type " + name
    "Binding" | "Let" => if name.is_empty() { "let" } else { "let " + name }
    "Call"
    | "Identifier"
    | "FieldAccess"
    | "FieldSegment"
    | "MethodSegment"
    | "ValueSegment"
    | "Constructor" => if name.is_empty() { kind } else { name }
    "MethodCall" =>
      if name.is_empty() {
        "method(…)"
      } else if name.contains("(") {
        name
      } else {
        name + "(…)"
      }
    "Mutation" => if name.is_empty() { "field =" } else { name + " =" }
    "RecordField" => if name.is_empty() { "field:" } else { name + ":" }
    "Parameter" => if name.is_empty() { "parameter" } else { name }
    "Argument" => if name.is_empty() { "argument" } else { name + ":" }
    "Constant" | "Value" => if scalar.is_empty() { "value" } else { scalar }
    "VarPattern" | "TuplePattern" | "ConstructorPattern" =>
      if name.is_empty() {
        "pattern"
      } else {
        name
      }
    "If" => "if"
    "Match" => "match"
    "Lambda" => if scalar.is_empty() { "fn" } else { "fn " + scalar + " =>" }
    "Sequence" => "then"
    "BinaryOperation" => if scalar.is_empty() { "binary" } else { scalar }
    "Pipe" => "pipe"
    "Array" => "array"
    "Tuple" => "tuple"
    "Block" => "block"
    _ =>
      if !name.is_empty() {
        kind + " " + name
      } else if !scalar.is_empty() {
        scalar
      } else {
        kind
      }
  }
  if label.is_empty() {
    base
  } else if kind == "Array" || kind == "Tuple" {
    label + ":"
  } else {
    label + ": " + base
  }
}

///|
fn node_tone(value : Json) -> String {
  let kind = json_string(json_field(value, "kind"), "")
  match kind {
    "Function" | "TypeDefinition" | "Binding" | "Implementation" => "definition"
    "Let" | "Mutation" | "RecordField" => "binding"
    "Call" | "MethodCall" | "MethodSegment" => "call"
    "FieldSegment" | "ValueSegment" => "value"
    "If" | "Match" | "Sequence" | "Lambda" | "Block" => "control"
    "Parameter"
    | "Argument"
    | "VarPattern"
    | "TuplePattern"
    | "ConstructorPattern" => "pattern"
    "Constant" | "Value" | "Identifier" | "Constructor" => "value"
    _ => "structure"
  }
}

///|
fn node_type_label(value : Json) -> String {
  json_string(json_field(value, "type"), "")
}

///|
fn node_scope_label(value : Json) -> String {
  let scope = json_string(json_field(value, "scope"), "")
  if !scope.is_empty() {
    scope
  } else {
    json_string(json_field(value, "targetScope"), "")
  }
}

///|
fn compact_role(label : String) -> String {
  match label {
    "" | "AST" | "body" | "expr" | "exprs" | "value" | "args" => ""
    _ => label
  }
}

///|
fn node_tooltip(value : Json) -> String {
  let title = node_title(value, "value")
  let location = match json_field(value, "loc") {
    Some(Null) | None => title
    Some(location) => title + "\n" + location.stringify()
  }
  let kind = json_string(json_field(value, "kind"), "")
  let type_label = node_type_label(value)
  let typed = if type_label.is_empty() {
    location
  } else {
    location + "\nType: " + type_label
  }
  let label = json_string(json_field(value, "label"), "")
  let described = if label.is_empty() {
    typed
  } else {
    typed + "\nArgument label: " + label
  }
  let symbol_type = json_string(json_field(value, "symbolType"), "")
  let symbol_typed = if symbol_type.is_empty() {
    described
  } else {
    described + "\nReferenced symbol type: " + symbol_type
  }
  let resolution = json_string(json_field(value, "resolution"), "")
  let resolution_hint = match resolution {
    "import" => "Definition resolved through this package's import alias"
    "using" => "Definition resolved through an explicit using declaration"
    "package" => "Definition matched in this package"
    "declared-receiver" => "Method matched using the receiver's declared type"
    "ambiguous" => "Multiple definitions match; compiler resolution is needed"
    "needs-type" => "Receiver type is needed to resolve this member"
    "unknown-import" => "Import alias unavailable; rebuild without --skip-check"
    "dependency-not-indexed" => "Target package source is not in this index"
    "unresolved" => "Definition not resolved in this package"
    _ => ""
  }
  let symbol_typed = if resolution_hint.is_empty() {
    symbol_typed
  } else {
    symbol_typed + "\n" + resolution_hint
  }
  let doc = match json_field(value, "doc") {
    Some(String(text)) => Some(text.to_json())
    _ =>
      match kind {
        "Impl::TopFuncDef" =>
          json_path(value, ["children", "fun_decl", "children", "doc"])
        "Impl::TopTypeDef" =>
          json_path(value, ["children", "value", "children", "doc"])
        _ => json_path(value, ["children", "doc"])
      }
  }
  match doc {
    Some(String(text)) if !text.is_empty() => symbol_typed + "\n\n" + text
    _ => symbol_typed
  }
}

///|
fn find_definition(definitions : Array[Json], id : String) -> Json? {
  for definition in definitions {
    if json_string(json_field(definition, "id"), "") == id {
      return json_field(definition, "ast")
    }
  }
  None
}
