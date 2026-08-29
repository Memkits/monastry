///|
test "opening a panel preserves its source column and replaces the right branch" {
  let first_value = { "name": "first" }.to_json()
  let second_value = { "name": "second" }.to_json()
  let replacement_value = { "name": "replacement" }.to_json()
  let first = (Default::default() : Store).update(
    OpenPanel(-1, "first", first_value),
  )
  let second = first.update(OpenPanel(0, "second", second_value))
  let replaced = second.update(OpenPanel(0, "replacement", replacement_value))
  inspect(first.panels.map(panel => panel.title).join("|"), content="first")
  inspect(
    second.panels.map(panel => panel.title).join("|"),
    content="first|second",
  )
  inspect(
    replaced.panels.map(panel => panel.title).join("|"),
    content="first|replacement",
  )
}

///|
test "opening an existing definition returns to its column without duplication" {
  let first_value = { "name": "first" }.to_json()
  let second_value = { "name": "second" }.to_json()
  let first = (Default::default() : Store).update(
    OpenPanel(-1, "first", first_value),
  )
  let second = first.update(OpenPanel(0, "second", second_value))
  let repeated_current = second.update(OpenPanel(1, "second", second_value))
  let returned_left = second.update(OpenPanel(1, "first", first_value))
  inspect(
    repeated_current.panels.map(panel => panel.title).join("|"),
    content="first|second",
  )
  inspect(
    returned_left.panels.map(panel => panel.title).join("|"),
    content="first",
  )
}
