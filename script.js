// CoQuery: AI-Powered SQL Editor
class CoQuery {
    constructor() {
        this.db = null;
        this.editor = null;
        this.currentDatabase = null;
        this.apiKey = null;
        this.model = 'gemini-2.5-flash';
        this.queryHistory = [];
        this.historyIndex = -1;
        
        this.init();
    }

    // Save API key to local storage
    saveApiKey(apiKey) {
        try {
            localStorage.setItem('coquery_api_key', apiKey);
            this.logSystem('API key saved to local storage', 'info');
        } catch (error) {
            console.error('Failed to save API key to local storage:', error);
            this.logSystem('Failed to save API key to local storage', 'warning');
        }
    }

    // Load API key from local storage
    loadApiKey() {
        try {
            const savedKey = localStorage.getItem('coquery_api_key');
            if (savedKey) {
                document.getElementById('apiKey').value = savedKey;
                this.apiKey = savedKey;
                this.logSystem('API key loaded from local storage', 'info');
                return true;
            }
        } catch (error) {
            console.error('Failed to load API key from local storage:', error);
            this.logSystem('Failed to load API key from local storage', 'warning');
        }
        return false;
    }

    // Clear API key from local storage
    clearApiKey() {
        try {
            localStorage.removeItem('coquery_api_key');
            this.apiKey = null;
            document.getElementById('apiKey').value = '';
            this.logSystem('API key cleared from local storage and input field', 'info');
            this.updateAgentResponse('API key cleared. Enter a new key to use AI features.');
        } catch (error) {
            console.error('Failed to clear API key from local storage:', error);
            this.logSystem('Failed to clear API key from local storage', 'warning');
        }
    }

    async init() {
        try {
            this.setupEventListeners();
            this.initializeCodeMirror();
            await this.loadSqlJs();
            console.log('SQL.js loaded, attempting to load database...');
            
            // Try to load database with retry
            let retries = 3;
            while (retries > 0) {
                try {
                    await this.loadDatabase('Chinook_Sqlite.sqlite');
                    break;
                } catch (error) {
                    retries--;
                    console.log(`Database load attempt failed, retries left: ${retries}`);
                    if (retries === 0) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Load saved API key if available
            const hasSavedKey = this.loadApiKey();
            
            if (hasSavedKey) {
                this.updateAgentResponse('Ready to help with your SQL queries using Gemini 2.5 Flash! 🚀\n\nAPI key loaded from storage. You can use Explain and NL2SQL features.');
            } else {
                this.updateAgentResponse('Ready to help with your SQL queries using Gemini 2.5 Flash! 🚀\n\nEnter your Google AI API key to use Explain and NL2SQL features.');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.logSystem(`Initialization error: ${error.message}`, 'error');
            this.updateAgentResponse('Error during initialization. Check the system log below.');
        }
    }

    setupEventListeners() {
        // Database selection
        document.getElementById('dbSelect').addEventListener('change', (e) => {
            this.loadDatabase(e.target.value);
        });

        // API key toggle
        document.getElementById('toggleKey').addEventListener('click', () => {
            const input = document.getElementById('apiKey');
            const button = document.getElementById('toggleKey');
            if (input.type === 'password') {
                input.type = 'text';
                button.innerHTML = '<i class="ti ti-eye-off"></i>';
            } else {
                input.type = 'password';
                button.innerHTML = '<i class="ti ti-eye"></i>';
            }
        });

        // API key input change handler
        document.getElementById('apiKey').addEventListener('input', (e) => {
            const apiKey = e.target.value.trim();
            if (apiKey) {
                this.apiKey = apiKey;
                this.saveApiKey(apiKey);
            }
        });

        // Schema toggle
        document.getElementById('toggleSchema').addEventListener('click', () => {
            const schemaBody = document.getElementById('schemaBody');
            const toggleBtn = document.getElementById('toggleSchema');
            const icon = toggleBtn.querySelector('i');
            
            if (schemaBody.classList.contains('collapsed')) {
                schemaBody.classList.remove('collapsed');
                icon.className = 'ti ti-chevron-up';
            } else {
                schemaBody.classList.add('collapsed');
                icon.className = 'ti ti-chevron-down';
            }
        });



        // Action buttons
        document.getElementById('executeBtn').addEventListener('click', () => this.executeQuery());
        document.getElementById('explainBtn').addEventListener('click', () => this.explainQuery());

        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('clearErrorsBtn').addEventListener('click', () => this.clearSystemLog());
        document.getElementById('clearApiKeyBtn').addEventListener('click', () => this.clearApiKey());
        document.getElementById('generateSqlBtn').addEventListener('click', () => this.generateSQLFromPrompt());
        document.getElementById('prevQueryBtn').addEventListener('click', () => this.showPreviousQuery());
        document.getElementById('nextQueryBtn').addEventListener('click', () => this.showNextQuery());
    }

    initializeCodeMirror() {
        this.editor = CodeMirror(document.getElementById('sqlEditor'), {
            mode: 'text/x-sql',
            theme: 'default',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            styleActiveLine: true,
            value: `SELECT 
  C.FirstName,
  C.LastName,
  C.Email,
  COUNT(I.InvoiceId) as InvoiceCount,
  SUM(I.Total) as TotalSpent
FROM Customer C
INNER JOIN Invoice I ON C.CustomerId = I.CustomerId
WHERE EXISTS (
  SELECT 1 
  FROM Track T
  INNER JOIN Album A ON T.AlbumId = A.AlbumId
  INNER JOIN Artist AR ON A.ArtistId = AR.ArtistId
  INNER JOIN InvoiceLine IL ON T.TrackId = IL.TrackId
  WHERE IL.InvoiceId = I.InvoiceId
    AND AR.Name = 'Queen'
)
AND EXISTS (
  SELECT 1
  FROM Employee E
  WHERE E.EmployeeId = C.SupportRepId
    AND E.Title = 'Sales Support Agent'
)
GROUP BY C.CustomerId, C.FirstName, C.LastName, C.Email
HAVING COUNT(I.InvoiceId) > 1
ORDER BY TotalSpent DESC
LIMIT 10;`,
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2
        });

        // Auto-resize editor
        this.editor.setSize('100%', '200px');
        this.addToHistory(this.editor.getValue());
    }

    async loadSqlJs() {
        try {
            // For WASM version, we need to initialize it properly
            if (typeof window.initSqlJs === 'undefined') {
                throw new Error('SQL.js WASM initialization function not found. Make sure sql-wasm.js is loaded.');
            }
            
            // Check if WASM file is accessible
            try {
                const wasmResponse = await fetch('./sql-wasm.wasm');
                if (!wasmResponse.ok) {
                    throw new Error(`WASM file not accessible: ${wasmResponse.status}`);
                }
                console.log('WASM file is accessible');
            } catch (wasmError) {
                console.warn('WASM file check failed:', wasmError);
            }
            
            console.log('Initializing SQL.js WASM...');
            this.logSystem('Initializing SQL.js WASM...', 'info');
            
            this.SQL = await window.initSqlJs({
                locateFile: file => {
                    console.log('Looking for file:', file);
                    return `./${file}`;
                }
            });
            
            console.log('SQL.js WASM loaded successfully:', this.SQL);
            this.logSystem('SQL.js WASM loaded successfully', 'info');
            
            // Verify SQL.Database constructor exists
            if (!this.SQL.Database) {
                throw new Error('SQL.Database constructor not found');
            }
            
            console.log('SQL.Database constructor verified');
        } catch (error) {
            console.error('SQL.js WASM loading error:', error);
            throw new Error(`Failed to load SQL.js WASM: ${error.message}`);
        }
    }

    async loadDatabase(dbPath) {
        try {
            console.log(`Attempting to load database: ${dbPath}`);
            this.updateAgentResponse(`Loading database: ${dbPath}...`);
            
            const response = await fetch(`data/${dbPath}`);
            console.log('Fetch response:', response);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const buffer = await response.arrayBuffer();
            console.log('Buffer received, size:', buffer.byteLength);
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js not properly loaded');
            }
            
            console.log('Creating SQL database instance...');
            this.db = new this.SQL.Database(new Uint8Array(buffer));
            this.currentDatabase = dbPath;
            
            console.log('Database created successfully, displaying schema...');
            this.displaySchema();
            this.logSystem(`Database ${dbPath} loaded successfully`, 'info');
            this.updateAgentResponse(`Database ${dbPath} loaded successfully! 📊`);
            
            // Set appropriate default query based on database
            this.setDefaultQuery(dbPath);
        } catch (error) {
            console.error('Database loading error:', error);
            this.logSystem(`Database loading error: ${error.message}`, 'error');
            this.updateAgentResponse(`Error loading database: ${error.message}`);
        }
    }

    setDefaultQuery(dbPath) {
        let defaultQuery = '';
        
        if (dbPath === 'Chinook_Sqlite.sqlite') {
            defaultQuery = `SELECT 
  C.FirstName,
  C.LastName,
  C.Email,
  COUNT(I.InvoiceId) as InvoiceCount,
  SUM(I.Total) as TotalSpent
FROM Customer C
INNER JOIN Invoice I ON C.CustomerId = I.CustomerId
WHERE EXISTS (
  SELECT 1 
  FROM Track T
  INNER JOIN Album A ON T.AlbumId = A.AlbumId
  INNER JOIN Artist AR ON A.ArtistId = AR.ArtistId
  INNER JOIN InvoiceLine IL ON T.TrackId = IL.TrackId
  WHERE IL.InvoiceId = I.InvoiceId
    AND AR.Name = 'Queen'
)
AND EXISTS (
  SELECT 1
  FROM Employee E
  WHERE E.EmployeeId = C.SupportRepId
    AND E.Title = 'Sales Support Agent'
)
GROUP BY C.CustomerId, C.FirstName, C.LastName, C.Email
HAVING COUNT(I.InvoiceId) > 1
ORDER BY TotalSpent DESC
LIMIT 10;`;
        } else if (dbPath === 'AdventureWorks-sqlite.db') {
            defaultQuery = `/*
  This query answers the question:
  "For each sales territory, what is the total sales amount, total number of orders,
  and average spend from only our top 5 customers in that territory for the year 2013?"
*/

WITH CustomerSales AS (
  -- Step 1: Calculate total sales and order count for each customer in each territory for 2013.
  SELECT
    soh.CustomerID,
    soh.TerritoryID,
    SUM(soh.TotalDue) AS TotalPurchaseAmount,
    COUNT(soh.SalesOrderID) AS NumberOfOrders
  FROM Sales.SalesOrderHeader AS soh
  WHERE
    strftime('%Y', soh.OrderDate) = '2013' AND soh.TerritoryID IS NOT NULL
  GROUP BY
    soh.CustomerID,
    soh.TerritoryID
),

RankedCustomers AS (
  -- Step 2: Rank customers within each territory based on their total purchase amount.
  -- A rank of 1 is the highest-spending customer in that territory.
  SELECT
    CustomerID,
    TerritoryID,
    TotalPurchaseAmount,
    NumberOfOrders,
    ROW_NUMBER() OVER(PARTITION BY TerritoryID ORDER BY TotalPurchaseAmount DESC) AS CustomerRank
  FROM CustomerSales
)

-- Step 3: Aggregate the data for only the top 5 ranked customers in each territory.
SELECT
  st.Name AS TerritoryName,
  COUNT(rc.CustomerID) AS TopCustomerCount, -- This will be 5, or fewer if a territory has <5 customers.
  '$' || printf('%.2f', SUM(rc.TotalPurchaseAmount)) AS TotalSalesFromTopCustomers,
  SUM(rc.NumberOfOrders) AS TotalOrdersFromTopCustomers,
  '$' || printf('%.2f', AVG(rc.TotalPurchaseAmount)) AS AvgSpendPerTopCustomer
FROM RankedCustomers AS rc
JOIN Sales.SalesTerritory AS st
  ON rc.TerritoryID = st.TerritoryID
WHERE
  rc.CustomerRank <= 5
GROUP BY
  st.Name
ORDER BY
  SUM(rc.TotalPurchaseAmount) DESC;`;
        }
        
        if (defaultQuery && this.editor) {
            this.editor.setValue(defaultQuery);
            this.logSystem(`Default query set for ${dbPath}`, 'info');
        }
    }

    displaySchema() {
        if (!this.db) return;

        try {
            const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            const schemaDiv = document.getElementById('schema');
            
            if (tables.length === 0) {
                schemaDiv.innerHTML = '<p class="text-muted">No tables found</p>';
                return;
            }

            let schemaHTML = '<div class="row g-2">';
            
            tables.forEach(({ columns, values }) => {
                values.forEach(row => {
                    const tableName = row[0];
                    const columnsInfo = this.db.exec(`PRAGMA table_info('${tableName}')`);
                    
                    let columnsList = '';
                    if (columnsInfo[0]) {
                        columnsList = columnsInfo[0].values.map(col => 
                            `<span class="badge bg-blue-lt me-1">${col[1]}</span>`
                        ).join('');
                    }
                    
                    schemaHTML += `
                        <div class="col-12">
                            <div class="card card-sm">
                                <div class="card-body p-2">
                                    <h6 class="card-title mb-1">${tableName}</h6>
                                    <div class="text-muted small">${columnsList}</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            });
            
            schemaHTML += '</div>';
            schemaDiv.innerHTML = schemaHTML;
        } catch (error) {
            console.error('Schema display error:', error);
            document.getElementById('schema').innerHTML = '<p class="text-danger">Error displaying schema</p>';
        }
    }

    async executeQuery() {
        const sql = this.editor.getValue().trim();
        if (!sql) {
            this.updateAgentResponse('Please enter a SQL query first.');
            return;
        }

        if (!this.db) {
            this.updateAgentResponse('Please select a database first.');
            return;
        }

        try {
            this.addToHistory(sql);
            this.updateAgentResponse('Executing query... ⚡');
            
            const startTime = performance.now();
            const results = this.db.exec(sql);
            const endTime = performance.now();
            
            this.displayResults(results, endTime - startTime);
            this.logSystem(`Query executed successfully in ${(endTime - startTime).toFixed(2)}ms`, 'info');
            this.updateAgentResponse(`Query executed successfully in ${(endTime - startTime).toFixed(2)}ms! ✅`);
        } catch (error) {
            console.error('Query execution error:', error);
            this.logSystem(`Query execution error: ${error.message}`, 'error');
            this.updateAgentResponse(`Query execution failed: ${error.message} ❌`);
            this.displayError(error.message);
        }
    }

    displayResults(results, executionTime) {
        const resultsDiv = document.getElementById('results');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="alert alert-success">
                    <h4 class="alert-title">Query executed successfully!</h4>
                    <p>No results returned. Execution time: ${executionTime.toFixed(2)}ms</p>
                </div>
            `;
            return;
        }

        let resultsHTML = `
            <div class="alert alert-success mb-3">
                <h4 class="alert-title">Query Results</h4>
                <p>Execution time: ${executionTime.toFixed(2)}ms</p>
            </div>
        `;

        results.forEach((result, index) => {
            const { columns, values } = result;
            
            if (values.length === 0) {
                resultsHTML += '<p class="text-muted">No rows returned</p>';
                return;
            }

            resultsHTML += `
                <div class="table-responsive mb-3">
                    <table class="table table-vcenter">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${values.map(row => `
                                <tr>
                                    ${row.map(val => `<td>${val !== null ? val : '<em class="text-muted">NULL</em>'}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        });

        resultsDiv.innerHTML = resultsHTML;
    }

    displayError(errorMessage) {
        document.getElementById('results').innerHTML = `
            <div class="alert alert-danger">
                <h4 class="alert-title">Query Error</h4>
                <p>${errorMessage}</p>
            </div>
        `;
    }

    async explainQuery() {
        await this.callAI('explain', 'Explain this SQL query in 1-3 sentences, breaking down what each part does and how it works:');
    }

    async callAI(action, prompt) {
        const sql = this.editor.getValue().trim();
        if (!sql) {
            this.updateAgentResponse('Please enter a SQL query first.');
            return;
        }

        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            this.updateAgentResponse('Please enter your API key to use AI features.\n\nGo to https://aistudio.google.com/ to create a key.');
            return;
        }

        try {
            this.updateAgentResponse(`🤖 Gemini 2.5 Flash is analyzing your query...`);
            
            const response = await this.callGeminiAPI(apiKey, prompt, sql);
            
            // Ensure response is a string
            if (!response || typeof response !== 'string') {
                throw new Error(`Invalid response from Gemini API: ${typeof response}`);
            }
            
            this.updateAgentResponse(response);
        } catch (error) {
            console.error('AI call error:', error);
            this.logSystem(`AI analysis error: ${error.message}`, 'error');
            this.updateAgentResponse(`AI analysis failed: ${error.message}`);
        }
    }

    async callGeminiAPI(apiKey, prompt, sql) {
        try {
            console.log('Calling Gemini API with model:', this.model);
            this.logSystem(`Calling Gemini API with model: ${this.model}`, 'info');
            
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
            console.log('Calling Gemini API URL:', apiUrl);
            this.logSystem(`Calling Gemini API: ${this.model}`, 'info');
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `You are an expert SQL analyst. Provide clear, helpful explanations and decompositions of SQL queries. Be concise but thorough.\n\n${prompt}\n\nSQL Query:\n${sql}`
                                }
                            ]
                        }
                    ],
                    tool_config: {
                      "function_calling_config": {
                         "mode": "NONE"
                      }
                    },
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 8192,
                        topP: 0.8,
                        topK: 40
                    }
                })
            });

            console.log('Gemini API response status:', response.status);
            this.logSystem(`Gemini API response status: ${response.status}`, 'info');

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Gemini API error response:', errorData);
                throw new Error(`Gemini API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log('Gemini API response data:', data);
            this.logSystem(`Gemini API response received, parsing...`, 'info');
            
            // Log the full response structure for debugging
            if (!data || typeof data !== 'object') {
                throw new Error(`Invalid response data type: ${typeof data}`);
            }
            
            // The response structure should be:
            // { "candidates": [ { "content": { "parts": [ { "text": "..." } ] } } ] }
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (typeof text !== 'string') {
                console.log('No text found in response, full data:', data);
                this.logSystem(`No text found in Gemini response. Response structure: ${JSON.stringify(data, null, 2)}`, 'warning');
                return 'Gemini AI responded but no text content was found. Please check the system log for details.';
            }
            
            if (typeof text !== 'string') {
                console.log('Text is not a string, converting:', text);
                text = String(text);
            }
            
            this.logSystem(`Successfully extracted text from Gemini response: ${text.substring(0, 100)}...`, 'info');
            return text;
            
        } catch (error) {
            console.error('Gemini API call error:', error);
            this.logSystem(`Gemini API call error: ${error.message}`, 'error');
            throw error;
        }
    }

    async callGeminiForSQL(apiKey, userPrompt, existingSql) {
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
            const body = {
                contents: [
                    {
                        parts: [
                            {
                                text: `You are an expert SQL developer. Given the existing SQL query and the user's instruction, return the revised SQL query only.\n\nUser Instruction:\n${userPrompt}\n\nExisting SQL Query:\n${existingSql}`
                            }
                        ]
                    }
                ],
                tool_config: {
                    function_calling_config: { mode: 'NONE' }
                },
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                    topP: 0.8,
                    topK: 40
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Gemini API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Extract SQL from code block if present
            const match = text.match(/```sql\n([\s\S]*?)```/i);
            return match ? match[1].trim() : text.trim();
        } catch (error) {
            console.error('Gemini SQL generation error:', error);
            this.logSystem(`Gemini SQL generation error: ${error.message}`, 'error');
            throw error;
        }
    }

    async generateSQLFromPrompt() {
        const userPrompt = document.getElementById('sqlPrompt').value.trim();
        const existingSql = this.editor.getValue();
        if (!userPrompt) {
            this.updateAgentResponse('Please enter a prompt to generate SQL.');
            return;
        }

        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            this.updateAgentResponse('Please enter your API key to use AI features.');
            return;
        }

        try {
            this.updateAgentResponse('🤖 Generating SQL...');
            const newSql = await this.callGeminiForSQL(apiKey, userPrompt, existingSql);
            if (newSql) {
                this.editor.setValue(newSql);
                this.flashEditor();
                this.addToHistory(newSql);
                this.updateAgentResponse('SQL inserted into editor.');
            } else {
                this.updateAgentResponse('No SQL generated.');
            }
        } catch (error) {
            this.updateAgentResponse(`SQL generation failed: ${error.message}`);
        }
    }

    flashEditor() {
        const el = this.editor.getWrapperElement();
        el.classList.add('sql-update-flash');
        setTimeout(() => el.classList.remove('sql-update-flash'), 800);
    }

    addToHistory(sql) {
        if (!sql) return;
        if (this.queryHistory.length === 0 || this.queryHistory[this.queryHistory.length - 1] !== sql) {
            this.queryHistory.push(sql);
            this.historyIndex = this.queryHistory.length - 1;
        }
    }

    showPreviousQuery() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const sql = this.queryHistory[this.historyIndex];
            this.editor.setValue(sql);
        }
    }

    showNextQuery() {
        if (this.historyIndex < this.queryHistory.length - 1) {
            this.historyIndex++;
            const sql = this.queryHistory[this.historyIndex];
            this.editor.setValue(sql);
        }
    }

    displayDecomposedParts(response) {
        const partsDiv = document.getElementById('decomposedParts');
        const partsList = document.getElementById('partsList');
        
        // Validate response
        if (!response || typeof response !== 'string') {
            console.error('Invalid response for decomposition:', response);
            this.logSystem(`Cannot decompose response: ${typeof response}`, 'error');
            partsDiv.style.display = 'none';
            return;
        }
        
        // Enhanced parsing to extract parts with multiple patterns
        let parts = [];
        
        // Try different patterns for decomposition
        const patterns = [
            /\d+\.\s+/g,           // "1. " pattern
            /•\s*/g,               // "• " pattern  
            /-\s*/g,               // "- " pattern
            /\n\s*[A-Z][^a-z]/g,   // New line starting with capital letter
            /\n\s*[a-z][^A-Z]/g    // New line starting with lowercase
        ];
        
        for (const pattern of patterns) {
            const splitResult = response.split(pattern);
            if (splitResult.length > 1) {
                parts = splitResult.filter(part => part.trim().length > 10); // Filter out very short parts
                console.log(`Found ${parts.length} parts using pattern:`, pattern);
                break;
            }
        }
        
        if (parts.length > 1) {
            let partsHTML = '';
            parts.forEach((part, index) => {
                if (part.trim()) {
                    partsHTML += `
                        <div class="card card-sm mb-2">
                            <div class="card-body p-2">
                                <div class="d-flex align-items-center">
                                    <span class="badge bg-green-lt me-2">${index + 1}</span>
                                    <span>${part.trim()}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
            
            partsList.innerHTML = partsHTML;
            partsDiv.style.display = 'block';
            this.logSystem(`Successfully decomposed response into ${parts.length} parts`, 'info');
        } else {
            // Hide the decomposed parts section if no parts found
            partsDiv.style.display = 'none';
            this.logSystem(`No decomposable parts found in response. Response length: ${response.length}`, 'info');
            
            // Log a sample of the response for debugging
            if (response.length > 200) {
                console.log('Response sample (first 200 chars):', response.substring(0, 200));
            } else {
                console.log('Full response:', response);
            }
        }
    }

    updateAgentResponse(message) {
        const agentDiv = document.getElementById('agentResponse');
        
        // Validate message
        if (!message || typeof message !== 'string') {
            console.error('Invalid message for agent response:', message);
            agentDiv.textContent = 'Invalid response received. Please check the system log for details.';
            agentDiv.className = 'agent-response';
            return;
        }
        
        // Check if the message contains markdown-like content
        if (message.includes('**') || message.includes('*') || message.includes('`') || message.includes('#')) {
            // Render markdown to HTML
            try {
                const htmlContent = marked.parse(message);
                agentDiv.innerHTML = htmlContent;
                agentDiv.className = 'agent-response markdown-content';
            } catch (error) {
                console.error('Markdown parsing error:', error);
                agentDiv.textContent = message;
                agentDiv.className = 'agent-response';
            }
        } else {
            // Plain text
            agentDiv.textContent = message;
            agentDiv.className = 'agent-response';
        }
    }

    logSystem(message, type = 'info') {
        const errorLog = document.getElementById('errorLog');
        const timestamp = new Date().toLocaleTimeString();
        
        // Remove "No errors logged yet..." message if it exists
        if (errorLog.querySelector('.text-muted')) {
            errorLog.innerHTML = '';
        }
        
        const errorItem = document.createElement('div');
        errorItem.className = `error-item ${type}`;
        errorItem.innerHTML = `
            <div class="error-timestamp">${timestamp}</div>
            <div class="error-message">${message}</div>
        `;
        
        errorLog.appendChild(errorItem);
        errorLog.scrollTop = errorLog.scrollHeight;
        
        // Also log to console for debugging
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    clearSystemLog() {
        const errorLog = document.getElementById('errorLog');
        errorLog.innerHTML = '<p class="text-muted">No system messages logged yet...</p>';
    }

    clearAll() {
        this.editor.setValue('');
        document.getElementById('results').innerHTML = '<p class="text-muted">Execute a query to see results...</p>';
        document.getElementById('decomposedParts').style.display = 'none';
        this.updateAgentResponse('Ready to help with your SQL queries using Gemini 2.5 Flash! 🚀\n\nEnter your Google AI API key to use Explain and NL2SQL features.');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new CoQuery();
});

// Export for potential external use
window.CoQuery = CoQuery;
