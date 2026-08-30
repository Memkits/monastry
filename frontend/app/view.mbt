///|
fn view_definition_summary(value : Json) -> RespoNode[ActionOp, GlobalEvent] {
  let doc = json_string(json_field(value, "doc"), "")
  let type_label = node_type_label(value)
  if doc.is_empty() && type_label.is_empty() {
    return div([])
  }
  div(class_name="definition-summary", [
    if doc.is_empty() {
      div([])
    } else {
      div(class_name="definition-doc", [
        span(class_name="summary-label", inner_text="DOCUMENTATION", []),
        span(class_name="summary-doc-text", inner_text=doc, []),
      ])
    },
    if type_label.is_empty() {
      div([])
    } else {
      div(class_name="definition-type", [
        span(class_name="summary-label", inner_text="TYPE", []),
        span(class_name="summary-type-text", inner_text=type_label, []),
      ])
    },
  ])
}

///|
fn collect_references(
  value : Json,
  definitions : Array[Json],
  seen : Array[String],
  result : Array[Json],
) -> Unit {
  match value {
    Object(fields) => {
      let target_id = json_string(fields.get("targetId"), "")
      if !target_id.is_empty() {
        let mut duplicate = false
        for id in seen {
          if id == target_id {
            duplicate = true
          }
        }
        let (_title, _target, linked) = node_target(value, definitions)
        if linked && !duplicate {
          seen.push(target_id)
          result.push(value)
        }
      }
      match fields.get("segments") {
        Some(Array(items)) =>
          for item in items {
            collect_references(item, definitions, seen, result)
          }
        _ => ()
      }
      match fields.get("children") {
        Some(Array(items)) =>
          for item in items {
            collect_references(item, definitions, seen, result)
          }
        _ => ()
      }
    }
    Array(items) =>
      for item in items {
        collect_references(item, definitions, seen, result)
      }
    _ => ()
  }
}

///|
fn view_reference_shelf(
  value : Json,
  definitions : Array[Json],
  source_index : Int,
) -> RespoNode[ActionOp, GlobalEvent] {
  let references : Array[Json] = []
  let seen : Array[String] = []
  collect_references(value, definitions, seen, references)
  if references.is_empty() {
    return div([])
  }
  let items = references.map(reference => {
    let (panel_title, panel_value, _linked) = node_target(
      reference, definitions,
    )
    button(
      class_name="reference-chip",
      attrs={ "title": node_tooltip(reference) },
      inner_text=node_code(reference, "definition"),
      on_click=(_event, dispatch) => {
        dispatch.run(OpenPanel(source_index, panel_title, panel_value))
        reveal_right_panel()
      },
    )
  })
  div(class_name="reference-shelf", [
    span(class_name="reference-label", inner_text="REFERENCED DEFINITIONS", []),
    div(class_name="reference-list", items),
  ])
}

///|
fn view_file_list(
  store : Store,
  files : Array[Json],
  entry : Json?,
  project : String,
  status : String,
) -> RespoNode[ActionOp, GlobalEvent] {
  let items : Array[RespoNode[ActionOp, GlobalEvent]] = []
  files.eachi((index, file) => {
    let path = json_string(json_field(file, "path"), "unknown")
    if store.query.is_empty() || path.contains(store.query) {
      items.push(
        button(
          class_name=if index == store.selected_file {
            "file-item selected"
          } else {
            "file-item"
          },
          inner_text=path,
          attrs={ "title": path },
          on_click=(_event, dispatch) => dispatch.run(SelectFile(index)),
        ),
      )
    }
  })
  div(class_name="topbar", [
    div(class_name="brand", [
      span(class_name="brand-mark", inner_text="◐", []),
      span(class_name="brand-name", inner_text="monastry", []),
      span(class_name="project-name", inner_text=project, []),
      span(class_name="status", inner_text=status, []),
    ]),
    match entry {
      Some(entry_value) => {
        let entry_name = json_string(json_field(entry_value, "name"), "main")
        let entry_path = json_string(json_field(entry_value, "path"), "")
        button(
          class_name=if store.selected_file == -1 {
            "entry-item selected"
          } else {
            "entry-item"
          },
          attrs={ "title": "Program entry · " + entry_path },
          inner_text="▶ " + entry_name,
          on_click=(_event, dispatch) => dispatch.run(SelectEntry),
        )
      }
      None =>
        div(class_name="entry-missing", [span(inner_text="No main entry", [])])
    },
    input(
      class_name="file-search",
      value=store.query,
      placeholder="Filter files…",
      on_input=(event, dispatch) => {
        if event is Input(value~, ..) {
          dispatch.run(SetQuery(value))
        }
      },
    ),
    div(class_name="file-count", [
      span(inner_text="\{files.length()} files", []),
    ]),
    div(class_name="file-list", items),
  ])
}

///|
fn view_main_tree(
  store : Store,
  files : Array[Json],
  entry : Json?,
  definitions : Array[Json],
) -> RespoNode[ActionOp, GlobalEvent] {
  if files.is_empty() {
    return div(class_name="empty", [
      span(inner_text="No MoonBit files were indexed.", []),
    ])
  }
  let (path, package_name, heading, ast) = if store.selected_file == -1 {
    match entry {
      Some(entry_value) =>
        (
          json_string(json_field(entry_value, "path"), "unknown"),
          json_string(json_field(entry_value, "package"), "."),
          "Program entry · " +
          json_string(json_field(entry_value, "name"), "main"),
          json_field(entry_value, "ast").unwrap_or(Json::array([])),
        )
      None => ("unknown", ".", "No program entry", Json::array([]))
    }
  } else {
    let index = if store.selected_file >= 0 &&
      store.selected_file < files.length() {
      store.selected_file
    } else {
      0
    }
    let file = files[index]
    (
      json_string(json_field(file, "path"), "unknown"),
      json_string(json_field(file, "package"), "."),
      "File AST",
      json_field(file, "astView").unwrap_or(Json::array([])),
    )
  }
  div(class_name="workspace", [
    div(class_name="toolbar", [
      div([
        span(class_name="path", inner_text=heading, []),
        span(class_name="package", inner_text=package_name + " · " + path, []),
      ]),
      span(
        class_name="hint",
        inner_text="Fully expanded · short expressions stay inline",
        [],
      ),
    ]),
    view_definition_summary(ast),
    div(class_name="tree-scroll", [
      comp_json_tree("AST", ast, 0, definitions, -1),
    ]),
    view_reference_shelf(ast, definitions, -1),
  ])
}

///|
fn view_panels(
  store : Store,
  definitions : Array[Json],
) -> RespoNode[ActionOp, GlobalEvent] {
  let panels = store.panels.mapi((index, panel) => {
    div(class_name="detail-panel", [
      div(class_name="panel-header", [
        span(class_name="panel-index", inner_text="\{index + 1}", []),
        span(class_name="panel-title", inner_text=panel.title, []),
        button(class_name="panel-close", inner_text="×", on_click=(
          _event,
          dispatch,
        ) => dispatch.run(ClosePanelsFrom(index))),
      ]),
      view_definition_summary(panel.value),
      div(class_name="panel-tree", [
        comp_json_tree(panel.title, panel.value, 0, definitions, index),
      ]),
      view_reference_shelf(panel.value, definitions, index),
    ])
  })
  div(class_name="panel-columns", panels)
}

///|
fn view(store : Store) -> RespoNode[ActionOp, GlobalEvent] {
  match store.data {
    None =>
      div(class_list=[@respo.ui_global, "loading-screen"], [
        span(class_name="loading-mark", inner_text="◐", []),
        span(inner_text=store.status, []),
      ])
    Some(data) => {
      let files = json_array(json_field(data, "files"))
      let entry = match json_path(data, ["program", "entry"]) {
        Some(entry_value) =>
          match entry_value {
            Object(_) => Some(entry_value)
            _ => None
          }
        _ => None
      }
      let definitions = json_array(json_path(data, ["program", "definitions"]))
      let project_field = match json_field(data, "project") {
        Some(project) => json_field(project, "name")
        None => None
      }
      let project = json_string(project_field, "MoonBit project")
      div(class_list=[@respo.ui_global, "app-shell"], [
        view_file_list(store, files, entry, project, store.status),
        div(class_name="content", [
          div(class_name="column-scroll", [
            view_main_tree(store, files, entry, definitions),
            view_panels(store, definitions),
          ]),
        ]),
      ])
    }
  }
}
