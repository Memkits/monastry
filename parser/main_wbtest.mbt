///|
test "parser keeps docs and expression structure" {
  @location.show_loc.val = @location.Json
  let (nodes, reports) = @mb_parser.parse_string(
    "/// add docs\npub fn add(a : Int, b : Int) -> Int { a + b }",
    name="demo.mbt",
  )
  inspect(reports.length(), content="0")
  let text = nodes
    .map(node => node.json_repr())
    .to_array()
    .to_json()
    .stringify()
  inspect(text.contains("Impl::TopFuncDef"), content="true")
  inspect(text.contains("add docs"), content="true")
  inspect(text.contains("Expr::Infix"), content="true")
  inspect(text.contains("demo.mbt"), content="true")
}
