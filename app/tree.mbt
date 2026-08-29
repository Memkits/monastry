///|
extern "js" fn reveal_right_panel() -> Unit =
  #| () => {
  #|   setTimeout(() => {
  #|     const strip = document.querySelector(".panel-strip")
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
    | "Constructor"
    | "Constant"
    | "Interp"
    | "BinaryOperation"
    | "Value" => true
    _ => false
  }
}

///|
fn node_target(value : Json, definitions : Array[Json]) -> (String, Json, Bool) {
  let code = node_code(value, "value")
  let target_id = json_string(json_field(value, "targetId"), "")
  let target = if target_id.is_empty() {
    None
  } else {
    find_definition(definitions, target_id)
  }
  match target {
    Some(definition) =>
      ("Definition · " + node_code(definition, code), definition, true)
    None => (code, value, false)
  }
}

///|
fn comp_inline_expression(
  value : Json,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  let code = node_code(value, "value")
  let tone = node_tone(value)
  let scope = node_scope_label(value)
  let (panel_title, panel_value, linked) = node_target(value, definitions)
  span(class_name="ast-inline-wrap", [
    button(
      class_name=if linked {
        "ast-inline-expr ast-inline-" + tone + " linked"
      } else {
        "ast-inline-expr ast-inline-" + tone
      },
      attrs={ "title": node_tooltip(value) },
      inner_text=code,
      on_click=(_event, dispatch) => {
        dispatch.run(OpenPanel(source_index, panel_title, panel_value))
        reveal_right_panel()
      },
    ),
    span(
      class_name=if scope.is_empty() {
        "ast-inline-scope empty"
      } else {
        "ast-inline-scope ast-inline-scope-" + scope
      },
      inner_text=scope,
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
        pair.0 != "definitionId"
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
      let code = node_code(value, label)
      let field_label = compact_role(label)
      let tone = node_tone(value)
      let type_label = node_type_label(value)
      let scope = node_scope_label(value)
      let children = tree_children(value, depth, definitions, source_index)
      let inlines = inline_children(value, definitions, source_index)
      let (panel_title, panel_value, linked) = node_target(value, definitions)
      div(class_name="ast-node", [
        div(class_name="ast-row", attrs={ "title": node_tooltip(value) }, [
          span(class_name="ast-branch", inner_text="", []),
          span(class_name="ast-field", inner_text=field_label, []),
          button(
            class_name=if linked {
              "ast-code ast-" + tone + " linked"
            } else {
              "ast-code ast-" + tone
            },
            attrs={ "title": node_tooltip(value) },
            inner_text=code,
            on_click=(_event, dispatch) => {
              dispatch.run(OpenPanel(source_index, panel_title, panel_value))
              reveal_right_panel()
            },
          ),
          span(
            class_name=if scope.is_empty() {
              "ast-scope empty"
            } else {
              "ast-scope ast-scope-" + scope
            },
            inner_text=scope,
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
