name = "tiye/monastry"

version = "0.1.0"

import {
  "moonbitlang/parser@0.3.9",
  "moonbitlang/lexer@0.3.9",
}

readme = "README.md"

repository = "https://github.com/Memkits/monastry"

license = "Apache-2.0"

keywords = [ "ast", "developer-tools", "moonbit" ]

description = "The command-line AST indexer and data service for Monastry"

preferred_target = "js"

options(
  exclude: [ "docs", "frontend", "test", "web", "vite.config.mjs", "yarn.lock" ],
)
