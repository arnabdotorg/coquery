# coquery

CoQuery is a minimal SQL playground powered by SQLite WASM and Groq
language models.  It ships with two sample databases (Chinook and
AdventureWorks) and exposes four actions:

* **Execute** – run the current SQL against the selected database.
* **Explain** – send the SQL to a Groq model for a natural‑language
  explanation.
* **Decompose & Verify** – ask Groq to break the query into logical
  steps and verify each part.
* **Clear** – reset the results and agent output.

## Running

Open `index.html` in a browser.  Supply your `groq_api_key` in the text
box to enable the explain/decompose features.  Queries are executed in
browser using the bundled SQLite databases from the `data/` directory.

The interface uses CodeMirror for SQL editing and `sql.js` for the WASM
SQLite engine.
