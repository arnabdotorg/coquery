import { Groq } from "https://esm.sh/groq-sdk";
import initSqlJs from "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js";

let db; // sql.js database
let editor; // CodeMirror instance
let groq; // Groq client

function logStatus(msg) {
  const logArea = document.getElementById('log');
  if (logArea) {
    logArea.value += `${msg}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }
}

window.addEventListener('error', (e) => logStatus(`JS Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => logStatus(`Promise rejection: ${e.reason}`));

async function init() {
  logStatus('Initializing editor');
  editor = CodeMirror(document.getElementById('sql'), {
    mode: 'text/x-sql',
    theme: 'eclipse',
    lineNumbers: true,
    value: 'SELECT 1;'
  });

  logStatus('Loading sql.js');
  const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` });
  logStatus('sql.js loaded');

  await loadDb(document.getElementById('dbSelect').value, SQL);

  document.getElementById('dbSelect').addEventListener('change', async (e) => {
    await loadDb(e.target.value, SQL);
  });

  document.getElementById('executeBtn').addEventListener('click', executeQuery);
  document.getElementById('explainBtn').addEventListener('click', () => explainQuery('explain this sql query and break it down into components:'));
  document.getElementById('decomposeBtn').addEventListener('click', () => explainQuery('decompose this sql query into parts and verify each step:'));
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('agent').value = '';
    document.getElementById('results').innerHTML = '';
    logStatus('Cleared output');
  });
}

async function loadDb(path, SQL) {
  try {
    logStatus(`Loading database: ${path}`);
    const res = await fetch(`data/${path}`);
    const buf = await res.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buf));
    logStatus(`Loaded database: ${path}`);
    showSchema();
  } catch (e) {
    logStatus(`DB load error: ${e.message}`);
  }
}

function showSchema() {
  const schemaDiv = document.getElementById('schema');
  if (!schemaDiv || !db) return;
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const lines = [];
    if (res[0]) {
      res[0].values.flat().forEach(table => {
        const colsRes = db.exec(`PRAGMA table_info('${table}')`);
        const cols = colsRes[0]?.values.map(row => row[1]) || [];
        lines.push(`${table}(${cols.join(', ')})`);
      });
    }
    schemaDiv.textContent = lines.join('\n');
    logStatus('Schema displayed');
  } catch (e) {
    schemaDiv.textContent = '';
    logStatus(`Schema error: ${e.message}`);
  }
}

function executeQuery() {
  const sql = editor.getValue();
  try {
    logStatus('Executing query');
    const res = db.exec(sql);
    const container = document.getElementById('results');
    container.innerHTML = '';
    res.forEach(({columns, values}) => {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      values.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(val => {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    });
    logStatus('Query executed');
  } catch (e) {
    document.getElementById('results').textContent = e.message;
    logStatus(`Query error: ${e.message}`);
  }
}

async function explainQuery(prompt) {
  const sql = editor.getValue();
  const key = document.getElementById('apiKey').value;
  if (!key) {
    alert('Please provide a Groq API key.');
    return;
  }
  if (!groq) {
    groq = new Groq({ apiKey: key });
  }
  try {
    logStatus('Requesting explanation');
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'user', content: `${prompt}\n\n${sql}` }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 1,
      max_completion_tokens: 1024,
      top_p: 1,
      stream: false
    });
    const text = chatCompletion.choices?.[0]?.message?.content || '';
    const agentBox = document.getElementById('agent');
    agentBox.value += `\n${text}`;
    logStatus('Explanation received');
  } catch (e) {
    logStatus(`Explanation error: ${e.message}`);
  }
}

init();
