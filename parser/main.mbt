///|
fn parse_one(path : String) -> Json {
  try {
    let (nodes, reports) = @mb_parser.parse_file(path)
    let ast = nodes.map(node => node.json_repr()).to_array()
    {
      "path": path.to_json(),
      "ast": ast.to_json(),
      "diagnostics": reports.to_json(),
    }.to_json()
  } catch {
    error =>
      {
        "path": path.to_json(),
        "ast": (Array::new() : Array[Json]).to_json(),
        "diagnostics": [{ "message": "\{error}" }.to_json()].to_json(),
      }.to_json()
  }
}

///|
fn main {
  @location.show_loc.val = @location.Json
  let argv = @env.args()
  let results : Array[Json] = []
  for index = 2; index < argv.length(); index = index + 1 {
    results.push(parse_one(argv[index]))
  }
  println(results.to_json().stringify())
}
