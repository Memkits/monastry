///|
fn view_file_list(
  store : Store,
  files : Array[Json],
  entry : Json?,
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
          on_click=(_event, dispatch) => dispatch.run(SelectFile(index)),
        ),
      )
    }
  })
  div(class_name="sidebar", [
    div(class_name="brand", [
      span(class_name="brand-mark", inner_text="◐", []),
      span(class_name="brand-name", inner_text="monastry", []),
    ]),
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
          inner_text="PROGRAM ENTRY\n▶ " + entry_name + "\n" + entry_path,
          on_click=(_event, dispatch) => dispatch.run(SelectEntry),
        )
      }
      None =>
        div(class_name="entry-missing", [span(inner_text="No main entry", [])])
    },
    div(class_name="file-count", [
      span(inner_text="\{files.length()} source files", []),
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
    div(class_name="tree-scroll", [
      comp_json_tree("AST", ast, 0, definitions, -1),
    ]),
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
      div(class_name="panel-tree", [
        comp_json_tree(panel.title, panel.value, 0, definitions, index),
      ]),
    ])
  })
  if panels.is_empty() {
    div([])
  } else {
    div(class_name="panel-strip", panels)
  }
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
        view_file_list(store, files, entry),
        div(class_name="content", [
          div(class_name="project-bar", [
            span(class_name="project-name", inner_text=project, []),
            span(class_name="status", inner_text=store.status, []),
          ]),
          div(class_name="content-row", [
            view_main_tree(store, files, entry, definitions),
            view_panels(store, definitions),
          ]),
        ]),
      ])
    }
  }
}
