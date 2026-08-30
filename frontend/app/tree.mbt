///|
extern "js" fn reveal_right_panel() -> Unit =
  #| () => {
  #|   setTimeout(() => {
  #|     const strip = document.querySelector(".column-scroll")
  #|     if (strip) strip.scrollTo({ left: strip.scrollWidth, behavior: "smooth" })
  #|   }, 40)
  #| }

///|
fn is_inline_expression(value : Json) -> Bool {
  let children = json_array(json_field(value, "children"))
  if !children.is_empty() {
    return false
  }
  let kind = json_string(json_field(value, "kind"), "")
  match kind {
    "Call"
    | "Identifier"
    | "FieldAccess"
    | "MethodCall"
    | "Constructor"
    | "Constant"
    | "Interp"
    | "BinaryOperation"
    | "Value" => true
    _ => false
  }
}

///|
/// Resolves a simplified AST node to a project-local definition when possible.
fn node_target(value : Json, definitions : Array[Json]) -> (String, Json, Bool) {
  let code = node_code(value, "value")
  let target_id = json_string(json_field(value, "targetId"), "")
  let target = if target_id.is_empty() {
    None
  } else {
    find_definition(definitions, target_id)
  }
  match target {
    Some(definition) => {
      let local_function = match json_field(definition, "localFunction") {
        Some(True) => true
        _ => false
      }
      if node_scope_label(value) == "local" && !local_function {
        (code, value, false)
      } else {
        ("Definition · " + node_code(definition, code), definition, true)
      }
    }
    None => (code, value, false)
  }
}

///|
fn node_link_style(value : Json, linked : Bool) -> String {
  let scope = node_scope_label(value)
  let definition_id = json_string(json_field(value, "definitionId"), "")
  if scope == "local" {
    " local-symbol"
  } else if linked && definition_id.is_empty() {
    " project-reference"
  } else {
    ""
  }
}

///|
fn comp_access_chain(
  value : Json,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  let parts : Array[RespoNode[ActionOp, GlobalEvent]] = []
  json_array(json_field(value, "segments")).eachi((index, segment) => {
    if index > 0 {
      parts.push(span(class_name="ast-chain-dot", inner_text=".", []))
    }
    let code = node_code(segment, "segment")
    let (panel_title, panel_value, linked) = node_target(segment, definitions)
    let linked_class = if linked { " linked" } else { "" }
    let segment_class = "ast-chain-segment" +
      node_link_style(segment, linked) +
      linked_class
    parts.push(
      if linked {
        button(
          class_name=segment_class,
          attrs={ "title": node_tooltip(segment) },
          inner_text=code,
          on_click=(_event, dispatch) => {
            dispatch.run(OpenPanel(source_index, panel_title, panel_value))
            reveal_right_panel()
          },
        )
      } else {
        span(
          class_name=segment_class,
          attrs={ "title": node_tooltip(segment) },
          inner_text=code,
          [],
        )
      },
    )
  })
  span(
    class_name="ast-access-chain",
    attrs={ "title": node_tooltip(value) },
    parts,
  )
}

///|
fn comp_symbol_code(
  value : Json,
  code_class : String,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  let segments = json_array(json_field(value, "segments"))
  let kind = json_string(json_field(value, "kind"), "")
  if !segments.is_empty() && (kind == "FieldAccess" || kind == "MethodCall") {
    return comp_access_chain(value, definitions, source_index)
  }
  let code = node_code(value, "value")
  let (panel_title, panel_value, linked) = node_target(value, definitions)
  if linked {
    button(
      class_name=code_class,
      attrs={ "title": node_tooltip(value) },
      inner_text=code,
      on_click=(_event, dispatch) => {
        dispatch.run(OpenPanel(source_index, panel_title, panel_value))
        reveal_right_panel()
      },
    )
  } else {
    span(
      class_name=code_class,
      attrs={ "title": node_tooltip(value) },
      inner_text=code,
      [],
    )
  }
}

///|
fn comp_inline_expression(
  value : Json,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  let tone = node_tone(value)
  let scope = node_scope_label(value)
  let (_panel_title, _panel_value, linked) = node_target(value, definitions)
  let code_class = if linked {
    "ast-inline-expr ast-inline-" +
    tone +
    " linked" +
    node_link_style(value, linked)
  } else {
    "ast-inline-expr ast-inline-" + tone + node_link_style(value, linked)
  }
  span(class_name="ast-inline-wrap", [
    comp_symbol_code(value, code_class, definitions, source_index),
    span(
      class_name=if scope.is_empty() || scope == "local" {
        "ast-inline-scope empty"
      } else {
        "ast-inline-scope ast-inline-scope-" + scope
      },
      inner_text=if scope == "local" { "" } else { scope },
      [],
    ),
  ])
}

///|
fn inline_children(
  value : Json,
  definitions : Array[Json],
  source_index : Int,
) -> Array[RespoNode[ActionOp, GlobalEvent]] {
  json_array(json_field(value, "children"))
  .filter(is_inline_expression)
  .map(child => comp_inline_expression(child, definitions, source_index))
}

///|
fn tree_children(
  value : Json,
  depth : Int,
  definitions : Array[Json],
  source_index : Int,
) -> Array[RespoNode[ActionOp, GlobalEvent]] {
  match json_field(value, "children") {
    Some(Array(items)) =>
      return items
        .filter(child => !is_inline_expression(child))
        .map(child => {
          let role = json_string(json_field(child, "role"), "")
          comp_json_tree(role, child, depth + 1, definitions, source_index)
        })
    _ => ()
  }
  match value {
    Object(fields) =>
      fields
      .to_array()
      .filter(pair => {
        pair.0 != "kind" &&
        pair.0 != "loc" &&
        pair.0 != "type" &&
        pair.0 != "doc" &&
        pair.0 != "name" &&
        pair.0 != "value" &&
        pair.0 != "role" &&
        pair.0 != "label" &&
        pair.0 != "targetId" &&
        pair.0 != "targetScope" &&
        pair.0 != "scope" &&
        pair.0 != "definitionId" &&
        pair.0 != "localFunction" &&
        pair.0 != "referenceName" &&
        pair.0 != "symbolType" &&
        pair.0 != "segments" &&
        pair.0 != "bindings"
      })
      .map(pair => {
        comp_json_tree(pair.0, pair.1, depth + 1, definitions, source_index)
      })
    Array(items) =>
      items.map(item => {
        comp_json_tree("", item, depth + 1, definitions, source_index)
      })
    _ => []
  }
}

///|
fn comp_json_tree(
  label : String,
  value : Json,
  depth : Int,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  match value {
    Null | True | False | Number(_) | String(_) =>
      div(class_name="ast-scalar", [
        span(class_name="ast-field", inner_text=label + ": ", []),
        span(class_name="ast-value", inner_text=compact_scalar(value), []),
      ])
    Array(_) if depth == 0 =>
      div(
        class_name="ast-root",
        tree_children(value, depth, definitions, source_index),
      )
    Object(_) | Array(_) => {
      let field_label = compact_role(label)
      let tone = node_tone(value)
      let type_label = node_type_label(value)
      let scope = node_scope_label(value)
      let children = tree_children(value, depth, definitions, source_index)
      let inlines = inline_children(value, definitions, source_index)
      let (_panel_title, _panel_value, linked) = node_target(value, definitions)
      let code_class = if linked {
        "ast-code ast-" + tone + " linked" + node_link_style(value, linked)
      } else {
        "ast-code ast-" + tone + node_link_style(value, linked)
      }
      div(class_name="ast-node", [
        div(class_name="ast-row", attrs={ "title": node_tooltip(value) }, [
          span(class_name="ast-branch", inner_text="", []),
          span(class_name="ast-field", inner_text=field_label, []),
          comp_symbol_code(value, code_class, definitions, source_index),
          span(
            class_name=if scope.is_empty() || scope == "local" {
              "ast-scope empty"
            } else {
              "ast-scope ast-scope-" + scope
            },
            inner_text=if scope == "local" { "" } else { scope },
            [],
          ),
          span(
            class_name=if type_label.is_empty() {
              "ast-type empty"
            } else {
              "ast-type"
            },
            attrs={ "title": type_label },
            inner_text=if type_label.is_empty() { "" } else { "T" },
            [],
          ),
          span(
            class_name=if inlines.is_empty() {
              "ast-inline-mark empty"
            } else {
              "ast-inline-mark"
            },
            inner_text=if inlines.is_empty() { "" } else { "→" },
            [],
          ),
          div(class_name="ast-inline-list", inlines),
        ]),
        if children.is_empty() {
          div([])
        } else {
          div(class_name="ast-children", children)
        },
      ])
    }
  }
}
