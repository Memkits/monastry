///|
using @respo_node {type RespoNode, div, span, input, button}

///|
struct Panel {
  title : String
  value : Json
} derive(Eq, ToJson)

///|
struct Store {
  data : Json?
  status : String
  query : String
  selected_file : Int
  panels : Array[Panel]
} derive(Eq)

///|
impl Default for Store with fn default() -> Store {
  {
    data: None,
    status: "Loading /api/index.json…",
    query: "",
    selected_file: -1,
    panels: [],
  }
}

///|
enum ActionOp {
  DataLoaded(Json)
  LoadFailed(String)
  SetQuery(String)
  SelectEntry
  SelectFile(Int)
  OpenPanel(Int, String, Json)
  ClosePanelsFrom(Int)
} derive(Eq, ToJson)

///|
fn Store::update(self : Store, op : ActionOp) -> Store {
  match op {
    DataLoaded(data) => { ..self, data: Some(data), status: "Ready" }
    LoadFailed(message) => { ..self, status: "Failed: " + message }
    SetQuery(query) => { ..self, query, }
    SelectEntry => { ..self, selected_file: -1, panels: [] }
    SelectFile(index) => { ..self, selected_file: index, panels: [] }
    OpenPanel(source_index, title, value) => {
      let keep_count = if source_index >= 0 &&
        source_index < self.panels.length() {
        source_index + 1
      } else {
        0
      }
      let panels = self.panels[0:keep_count].to_owned()
      let mut existing_index = -1
      panels.eachi((index, panel) => {
        if panel.value == value {
          existing_index = index
        }
      })
      if existing_index >= 0 {
        { ..self, panels: panels[0:existing_index + 1].to_owned() }
      } else {
        panels.push({ title, value })
        { ..self, panels, }
      }
    }
    ClosePanelsFrom(index) => {
      let panels = self.panels[0:index].to_owned()
      { ..self, panels, }
    }
  }
}

///|
enum GlobalEvent {
  Placeholder
} derive(Default, Eq)
