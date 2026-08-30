///|
extern "js" fn fetch_index(
  url : String,
  on_ok : (String) -> Unit,
  on_error : (String) -> Unit,
) -> Unit =
  #| (url, on_ok, on_error) => {
  #|   fetch(url)
  #|     .then((response) => {
  #|       if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  #|       return response.text()
  #|     })
  #|     .then(on_ok, (error) => on_error(String(error)))
  #| }

///|
extern "js" fn index_url(default_url : String) -> String =
  #| (default_url) => new URLSearchParams(window.location.search).get("data") || default_url

///|
/// Starts the Respo viewer and loads the AST index selected by the page URL.
fn main {
  let window = @dom.window()
  let mount_target = window
    .document()
    .query_selector(".app")
    .unwrap()
    .reinterpret_as_node()
  // Owns the viewer state, mount point, and persisted Respo session.
  let app : @respo.RespoApp[Store] = {
    store: Ref((Default::default() : Store)),
    mount_target,
    storage_key: "monastry",
  }
  // Applies one state transition and schedules the following render.
  let update_store = fn(op : ActionOp) {
    app.store.val = app.store.val.update(op)
    @respo.mark_need_rerender()
  }
  // Adapts Respo dispatch to the viewer's ActionOp update function.
  let dispatch_action : (ActionOp) -> Unit raise @respo_node.RespoCommonError = fn(
    op,
  ) {
    update_store(op)
  }
  app.render_loop(() => view(app.store.val), dispatch_action)
  fetch_index(
    index_url("/api/index.json"),
    text => {
      update_store(DataLoaded(@json.parse(text))) catch {
        error => update_store(LoadFailed("\{error}"))
      }
    },
    message => update_store(LoadFailed(message)),
  )
}
