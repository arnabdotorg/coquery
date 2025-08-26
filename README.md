# coquery

CoQuery is a minimal vibe-coded SQL playground powered by SQLite WASM and Google Gemini
language models. 
There is no backend, everything is in the webpage frontend.  
It ships with two sample databases (Chinook and
AdventureWorks) and exposes four actions:

* **Execute** – run the current SQL against the selected database.
* **Explain** – send the SQL to Gemini for a natural‑language
  explanation.
* **Decompose & Verify** – ask Gemini to break the query into logical
  steps and verify each part.
* **NL2SQL** – Ask Gemini to convert your natural language to SQL

## Demo
You can try it out at https://arnabdotorg.github.io/coquery/

## Running

Open `index.html` in a browser.  Supply your `gemini_api_key` in the text
box to enable the explain/decompose features.  Queries are executed in
browser using the bundled SQLite databases from the `data/` directory.

The interface uses CodeMirror for SQL editing and `sql.js` for the WASM
SQLite engine.
