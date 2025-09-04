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
        this.lastQueryResults = null;
        this.lastExecutedQuery = null;
        
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
            
            // Load default database (Chinook)
            await this.loadDatabase('Chinook_Sqlite.sqlite');
            
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
            console.log('Database selection changed to:', e.target.value);
            this.logSystem(`Switching to database: ${e.target.value}`, 'info');
            
            // For TPC-DS, try embedded database directly first
            if (e.target.value === 'tpcds.db' && typeof loadEmbeddedTpcds !== 'undefined') {
                this.loadEmbeddedDatabaseDirectly(e.target.value);
            } else {
                this.loadDatabase(e.target.value);
            }
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
        document.getElementById('explainResultsBtn').addEventListener('click', () => this.explainResults());

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
            
            console.log('Initializing SQL.js WASM...');
            this.logSystem('Initializing SQL.js WASM...', 'info');
            
            // Try different initialization strategies
            let initOptions = {};
            
            // Check if we're using file:// protocol
            if (window.location.protocol === 'file:') {
                console.log('File protocol detected, using CDN WASM');
                initOptions = {
                    locateFile: file => {
                        if (file.endsWith('.wasm')) {
                            // Use CDN for WASM file when using file:// protocol
                            return `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`;
                        }
                        return `./${file}`;
                    }
                };
            } else {
                console.log('HTTP protocol detected, using local WASM');
                initOptions = {
                    locateFile: file => {
                        console.log('Looking for file:', file);
                        return `./${file}`;
                    }
                };
            }
            
            this.SQL = await window.initSqlJs(initOptions);
            
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

    async loadEmbeddedChinook(dbPath) {
        try {
            console.log('Loading Chinook via embedded database...');
            this.updateAgentResponse('Loading Chinook database (embedded)...');
            
            // Ensure SQL.js is loaded
            if (!this.SQL || !this.SQL.Database) {
                console.log('Initializing SQL.js...');
                await this.loadSqlJs();
            }
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js failed to initialize');
            }
            
            if (typeof loadEmbeddedChinookDirect === 'undefined') {
                throw new Error('Embedded Chinook database not available');
            }
            
            // Load embedded database with SQL.js reference
            console.log('Loading embedded Chinook database...');
            // Pass SQL.js reference to the loader
            window.SQL = this.SQL;
            this.db = loadEmbeddedChinookDirect();
            
            if (!this.db) {
                throw new Error('Failed to create Chinook database from embedded data');
            }
            
            this.currentDatabase = dbPath;
            
            // Verify the database
            const testQuery = this.db.exec("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
            if (testQuery && testQuery.length > 0) {
                const tableCount = testQuery[0].values[0][0];
                console.log(`Embedded Chinook loaded with ${tableCount} tables`);
                this.logSystem(`Embedded Chinook database loaded with ${tableCount} tables`, 'info');
            }
            
            // Display schema and set default query
            this.displaySchema();
            this.updateAgentResponse(`✅ Chinook database loaded successfully!\n\nUsing embedded database - no server required! 🎵`);
            this.setDefaultQuery(dbPath);
            
        } catch (error) {
            console.error('Chinook embedded loading failed:', error);
            this.logSystem(`Chinook embedded loading failed: ${error.message}`, 'error');
            
            // Fall back to file input
            if (window.location.protocol === 'file:') {
                this.showDatabaseFileInput(dbPath);
            }
        }
    }

    async loadEmbeddedDatabaseDirectly(dbPath) {
        try {
            console.log('Loading TPC-DS via embedded database...');
            this.updateAgentResponse('Loading TPC-DS database (embedded)...');
            
            // Ensure SQL.js is loaded
            if (!this.SQL || !this.SQL.Database) {
                console.log('Initializing SQL.js...');
                await this.loadSqlJs();
            }
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js failed to initialize');
            }
            
            if (typeof loadEmbeddedDatabaseDirectly === 'undefined') {
                throw new Error('Embedded database not available');
            }
            
            // Load embedded database with SQL.js reference
            console.log('Loading embedded TPC-DS database...');
            // Pass SQL.js reference to the loader
            window.SQL = this.SQL;
            this.db = loadEmbeddedDatabaseDirectly();
            
            if (!this.db) {
                throw new Error('Failed to create database from embedded data');
            }
            
            this.currentDatabase = dbPath;
            
            // Verify the database
            const testQuery = this.db.exec("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
            if (testQuery && testQuery.length > 0) {
                const tableCount = testQuery[0].values[0][0];
                console.log(`Embedded TPC-DS loaded with ${tableCount} tables`);
                this.logSystem(`Embedded TPC-DS database loaded with ${tableCount} tables`, 'info');
            }
            
            // Display schema and set default query
            this.displaySchema();
            this.updateAgentResponse(`✅ TPC-DS database loaded successfully!\n\nUsing embedded database - no server required! 📊`);
            this.setDefaultQuery(dbPath);
            
        } catch (error) {
            console.error('Direct embedded loading failed:', error);
            this.logSystem(`Direct embedded loading failed: ${error.message}`, 'error');
            
            // Fall back to regular loading method
            this.updateAgentResponse(`Embedded loading failed, trying other methods...`);
            this.loadDatabase(dbPath);
        }
    }

    async loadDatabase(dbPath) {
        try {
            console.log(`Attempting to load database: ${dbPath}`);
            this.updateAgentResponse(`Loading database: ${dbPath}...`);
            
            // Try embedded databases first
            if (dbPath === 'Chinook_Sqlite.sqlite' && typeof loadEmbeddedChinookDirect !== 'undefined') {
                console.log('Loading embedded Chinook database...');
                this.loadEmbeddedChinook(dbPath);
                return;
            }
            
            if (dbPath === 'tpcds.db' && typeof loadEmbeddedTpcds !== 'undefined') {
                console.log('Loading embedded TPC-DS database...');
                this.loadEmbeddedDatabaseDirectly(dbPath);
                return;
            }
            
            // Check if we're running from file:// protocol
            if (window.location.protocol === 'file:') {
                console.log('File protocol detected - showing file input for manual loading');
                this.showDatabaseFileInput(dbPath);
                return;
            }
            
            // Try different paths in case of server configuration issues
            let response;
            const paths = [
                `data/${dbPath}`,
                `./data/${dbPath}`,
                `/data/${dbPath}`,
                `${window.location.origin}/data/${dbPath}`
            ];
            
            for (const path of paths) {
                try {
                    console.log(`Trying path: ${path}`);
                    response = await fetch(path);
                    if (response.ok) {
                        console.log(`Success with path: ${path}`);
                        break;
                    }
                } catch (e) {
                    console.log(`Failed with path ${path}: ${e.message}`);
                }
            }
            
            if (!response || !response.ok) {
                throw new Error(`Failed to fetch database from any path. Last status: ${response?.status || 'N/A'}`);
            }
            
            const buffer = await response.arrayBuffer();
            console.log('Buffer received, size:', buffer.byteLength);
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js not properly loaded');
            }
            
            console.log('Creating SQL database instance...');
            const uint8Array = new Uint8Array(buffer);
            console.log(`Creating database from Uint8Array of size: ${uint8Array.length}`);
            
            this.db = new this.SQL.Database(uint8Array);
            this.currentDatabase = dbPath;
            
            // Verify the database is working
            const testQuery = this.db.exec("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
            if (testQuery && testQuery.length > 0) {
                const tableCount = testQuery[0].values[0][0];
                console.log(`Database loaded with ${tableCount} tables`);
                this.logSystem(`Database ${dbPath} loaded with ${tableCount} tables`, 'info');
            }
            
            console.log('Database created successfully, displaying schema...');
            this.displaySchema();
            this.updateAgentResponse(`Database ${dbPath} loaded successfully! 📊`);
            
            // Set appropriate default query based on database
            this.setDefaultQuery(dbPath);
        } catch (error) {
            console.error('Database loading error:', error);
            this.logSystem(`Database loading error: ${error.message}`, 'error');
            
            // Provide helpful error message and fallback option
            let helpMessage = `Error loading database: ${error.message}\n\n`;
            
            if (error.message.includes('404') || error.message.includes('Failed to fetch')) {
                // Try embedded database first for TPC-DS
                if (dbPath === 'tpcds.db' && typeof loadEmbeddedDatabaseDirectly !== 'undefined') {
                    helpMessage += 'Trying embedded TPC-DS database...\n\n';
                    this.updateAgentResponse(helpMessage);
                    // Use setTimeout to make this async call non-blocking
                    setTimeout(() => this.tryEmbeddedDatabase(dbPath), 100);
                    return; // Exit early, tryEmbeddedDatabase will handle success/failure
                } else {
                    helpMessage += 'Since automatic loading failed, you can manually load the database file.\n\n';
                    helpMessage += 'Click the "Load Database File" button that will appear below.';
                    
                    // Show file input for manual database loading
                    this.showFileInput(dbPath);
                }
            } else if (error.message.includes('SQL.js')) {
                helpMessage += 'SQL.js initialization issue. Try refreshing the page.';
            }
            
            this.updateAgentResponse(helpMessage);
            
            // Clear the db on error so we don't have a partially loaded state
            this.db = null;
            this.currentDatabase = null;
            
            // Show current state in console
            console.log('Current state after error:');
            console.log('  this.db:', this.db);
            console.log('  this.SQL:', this.SQL);
            console.log('  this.currentDatabase:', this.currentDatabase);
        }
    }

    async tryEmbeddedDatabase(dbPath) {
        try {
            console.log('Attempting to load embedded TPC-DS database...');
            this.logSystem('Trying embedded TPC-DS database...', 'info');
            
            // Ensure SQL.js is loaded first
            if (!this.SQL || !this.SQL.Database) {
                console.log('SQL.js not ready, initializing...');
                this.updateAgentResponse('Loading SQL.js for embedded database...');
                await this.loadSqlJs();
            }
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js failed to initialize');
            }
            
            if (typeof loadEmbeddedDatabaseDirectly === 'undefined') {
                throw new Error('Embedded TPC-DS database not available');
            }
            
            // Load embedded database
            this.db = loadEmbeddedDatabaseDirectly();
            
            if (!this.db) {
                throw new Error('Failed to load embedded database');
            }
            
            this.currentDatabase = dbPath;
            
            // Verify the database is working
            const testQuery = this.db.exec("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
            if (testQuery && testQuery.length > 0) {
                const tableCount = testQuery[0].values[0][0];
                console.log(`Embedded database loaded with ${tableCount} tables`);
                this.logSystem(`Embedded TPC-DS database loaded with ${tableCount} tables`, 'info');
            }
            
            // Display schema and set default query
            this.displaySchema();
            this.updateAgentResponse(`Embedded TPC-DS database loaded successfully! 📊\n\nNo web server required - database is embedded in the application.`);
            this.setDefaultQuery(dbPath);
            
        } catch (error) {
            console.error('Embedded database loading error:', error);
            this.logSystem(`Embedded database loading error: ${error.message}`, 'error');
            
            // Fall back to file input
            let helpMessage = `Embedded database loading failed: ${error.message}\n\n`;
            helpMessage += 'You can manually load the database file.\n\n';
            helpMessage += 'Click the "Load Database File" button that will appear below.';
            
            this.updateAgentResponse(helpMessage);
            this.showFileInput(dbPath);
            
            // Clear the db on error
            this.db = null;
            this.currentDatabase = null;
        }
    }

    showDatabaseFileInput(dbPath) {
        // Create file input for manual database loading (for file:// protocol)
        const agentDiv = document.getElementById('agentResponse');
        
        // Remove existing file input if present
        const existingInput = document.getElementById('dbFileInput');
        if (existingInput) {
            existingInput.remove();
        }
        
        // Update agent response
        this.updateAgentResponse(`Running without a server - please load the database file manually.\n\nSelect the ${dbPath} file from your data folder below:`);
        
        // Create file input
        const fileInputContainer = document.createElement('div');
        fileInputContainer.id = 'dbFileInput';
        fileInputContainer.style.marginTop = '15px';
        fileInputContainer.style.padding = '15px';
        fileInputContainer.style.border = '2px dashed #206bc4';
        fileInputContainer.style.borderRadius = '8px';
        fileInputContainer.style.backgroundColor = '#f1f5f9';
        
        fileInputContainer.innerHTML = `
            <div style="text-align: center;">
                <h4 style="color: #206bc4; margin-bottom: 10px;">📁 Load Database File</h4>
                <p style="margin-bottom: 15px;">Select <strong>${dbPath}</strong> from your computer:</p>
                <input type="file" id="manualDbFile" accept=".db,.sqlite" style="margin: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <button id="loadDbBtn" class="btn btn-primary" style="margin: 10px;">
                    <i class="ti ti-database"></i> Load Database
                </button>
                <p style="font-size: 13px; color: #666; margin-top: 10px;">
                    📍 File location: <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">/Users/tafeng/coquery/data/${dbPath}</code>
                </p>
            </div>
        `;
        
        // Insert after agent response
        agentDiv.parentNode.insertBefore(fileInputContainer, agentDiv.nextSibling);
        
        // Add event listener for file loading
        document.getElementById('loadDbBtn').addEventListener('click', () => {
            this.loadDatabaseFromFile(dbPath);
        });
        
        // Also add file input change listener for immediate loading
        document.getElementById('manualDbFile').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                document.getElementById('loadDbBtn').click();
            }
        });
    }

    showFileInput(dbPath) {
        // Legacy method - redirect to new one
        this.showDatabaseFileInput(dbPath);
    }

    async loadDatabaseFromFile(expectedPath) {
        const fileInput = document.getElementById('manualDbFile');
        const file = fileInput.files[0];
        
        if (!file) {
            this.updateAgentResponse('Please select a database file first.');
            return;
        }
        
        try {
            this.updateAgentResponse(`Loading database from file: ${file.name}...`);
            
            // Read file as array buffer
            const buffer = await file.arrayBuffer();
            console.log(`File loaded: ${file.name}, size: ${buffer.byteLength} bytes`);
            
            if (!this.SQL || !this.SQL.Database) {
                throw new Error('SQL.js not properly loaded');
            }
            
            // Create database instance
            const uint8Array = new Uint8Array(buffer);
            this.db = new this.SQL.Database(uint8Array);
            this.currentDatabase = expectedPath;
            
            // Verify the database is working
            const testQuery = this.db.exec("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
            if (testQuery && testQuery.length > 0) {
                const tableCount = testQuery[0].values[0][0];
                console.log(`Database loaded with ${tableCount} tables`);
                this.logSystem(`Database ${expectedPath} loaded from file with ${tableCount} tables`, 'info');
            }
            
            // Display schema and set default query
            this.displaySchema();
            this.updateAgentResponse(`Database loaded successfully from file: ${file.name}! 📊`);
            this.setDefaultQuery(expectedPath);
            
            // Hide file input after successful loading
            const fileInputContainer = document.getElementById('dbFileInput');
            if (fileInputContainer) {
                fileInputContainer.style.display = 'none';
            }
            
        } catch (error) {
            console.error('File loading error:', error);
            this.logSystem(`File loading error: ${error.message}`, 'error');
            this.updateAgentResponse(`Error loading database file: ${error.message}`);
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
        } else if (dbPath === 'tpcds.db') {
            defaultQuery = `-- TPC-DS Sample Query: Cross-channel sales analysis
-- Analyzes sales across store, web, and catalog channels

WITH all_sales AS (
    -- Store sales
    SELECT 
        'Store' as channel,
        ss_sold_date_sk as sold_date_sk,
        ss_item_sk as item_sk,
        ss_customer_sk as customer_sk,
        ss_quantity as quantity,
        ss_sales_price as sales_price,
        ss_ext_sales_price as ext_sales_price,
        ss_net_profit as net_profit
    FROM store_sales
    
    UNION ALL
    
    -- Web sales
    SELECT 
        'Web' as channel,
        ws_sold_date_sk,
        ws_item_sk,
        ws_bill_customer_sk,
        ws_quantity,
        ws_sales_price,
        ws_ext_sales_price,
        ws_net_profit
    FROM web_sales
    
    UNION ALL
    
    -- Catalog sales
    SELECT 
        'Catalog' as channel,
        cs_sold_date_sk,
        cs_item_sk,
        cs_bill_customer_sk,
        cs_quantity,
        cs_sales_price,
        cs_ext_sales_price,
        cs_net_profit
    FROM catalog_sales
)
SELECT 
    channel,
    i.i_item_id,
    i.i_item_desc,
    i.i_category,
    COUNT(DISTINCT customer_sk) as unique_customers,
    SUM(quantity) as total_quantity,
    SUM(ext_sales_price) as total_revenue,
    SUM(net_profit) as total_profit,
    AVG(sales_price) as avg_sales_price
FROM all_sales a
JOIN item i ON a.item_sk = i.i_item_sk
JOIN date_dim d ON a.sold_date_sk = d.d_date_sk
WHERE d.d_year = 2001
GROUP BY channel, i.i_item_id, i.i_item_desc, i.i_category
ORDER BY channel, total_revenue DESC;`;
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

    getSchemaContext() {
        if (!this.db) return "No database loaded";
        
        try {
            const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            if (tables.length === 0) {
                return "No tables found in database";
            }
            
            let schemaText = "";
            tables.forEach(({ columns, values }) => {
                values.forEach(row => {
                    const tableName = row[0];
                    const columnsInfo = this.db.exec(`PRAGMA table_info('${tableName}')`);
                    
                    if (columnsInfo[0]) {
                        const columns = columnsInfo[0].values.map(col => 
                            `${col[1]} (${col[2]})`
                        ).join(', ');
                        schemaText += `Table: ${tableName}\nColumns: ${columns}\n\n`;
                    }
                });
            });
            
            return schemaText.trim();
        } catch (error) {
            console.error('Schema context error:', error);
            return "Error retrieving schema information";
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
            console.error('Database is null. Current database:', this.currentDatabase);
            this.logSystem('Database not loaded. Please select a database from the dropdown.', 'error');
            this.updateAgentResponse('Database not loaded. Please select a database from the dropdown or check the System Log for errors.');
            return;
        }

        // R4: Basic error detection and auto-fix before execution
        const validationResult = this.validateQuery(sql);
        if (!validationResult.isValid) {
            this.logSystem(`Query validation error: ${validationResult.error}`, 'warning');
            
            // Show clickable auto-fix option
            if (validationResult.fixedQuery) {
                this.displayAutoFixSuggestion(validationResult);
                return; // Don't execute until user decides
            } else {
                this.updateAgentResponse(`⚠️ Query validation warning: ${validationResult.error}\n\n${validationResult.suggestion || ''}`);
            }
        }

        try {
            this.addToHistory(sql);
            this.updateAgentResponse('Executing query... ⚡');
            
            const startTime = performance.now();
            const results = this.db.exec(sql);
            const endTime = performance.now();
            
            // Store results for explanation
            this.lastQueryResults = results;
            this.lastExecutedQuery = sql;
            
            this.displayResults(results, endTime - startTime);
            this.logSystem(`Query executed successfully in ${(endTime - startTime).toFixed(2)}ms`, 'info');
            
            // R5: Generate follow-up query suggestions
            const suggestions = this.generateFollowUpSuggestions(sql, results);
            let responseMessage = `Query executed successfully in ${(endTime - startTime).toFixed(2)}ms! ✅`;
            this.updateAgentResponse(responseMessage);
            
            // Add clickable follow-up suggestions
            if (suggestions.length > 0) {
                this.displayClickableSuggestions(suggestions, sql);
            }
            
            // Show explain results button if we have results
            const explainResultsBtn = document.getElementById('explainResultsBtn');
            if (results && results.length > 0 && results[0].values && results[0].values.length > 0) {
                explainResultsBtn.style.display = 'inline-block';
            } else {
                explainResultsBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Query execution error:', error);
            this.logSystem(`Query execution error: ${error.message}`, 'error');
            
            // R4: Enhanced error detection with suggestions
            const errorSuggestion = this.getErrorSuggestion(error.message, sql);
            this.updateAgentResponse(`Query execution failed: ${error.message} ❌\n\n${errorSuggestion}`);
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

    formatResultsForAI(results) {
        if (!results || results.length === 0) {
            return "No results returned";
        }

        let formatted = "";
        results.forEach((result, index) => {
            const { columns, values } = result;
            
            if (values.length === 0) {
                formatted += "No rows returned\n";
                return;
            }

            // Show column headers
            formatted += `Result Set ${index + 1}:\n`;
            formatted += `Columns: ${columns.join(', ')}\n`;
            formatted += `Total Rows: ${values.length}\n\n`;
            
            // Show first few rows for analysis (limit to 10 rows to avoid token limits)
            const rowsToShow = Math.min(10, values.length);
            for (let i = 0; i < rowsToShow; i++) {
                const row = values[i];
                const rowData = columns.map((col, idx) => `${col}: ${row[idx] !== null ? row[idx] : 'NULL'}`).join(', ');
                formatted += `Row ${i + 1}: ${rowData}\n`;
            }
            
            if (values.length > 10) {
                formatted += `... (${values.length - 10} more rows)\n`;
            }
            
            formatted += "\n";
        });

        return formatted;
    }

    async explainResults() {
        if (!this.lastQueryResults || !this.lastExecutedQuery) {
            this.updateAgentResponse('No query results to explain. Execute a query first.');
            return;
        }

        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            this.updateAgentResponse('Please enter your API key to use AI features.\n\nGo to https://aistudio.google.com/ to create a key.');
            return;
        }

        try {
            this.updateAgentResponse('🤖 Gemini is analyzing your query results...');
            
            // Format results for AI analysis
            const formattedResults = this.formatResultsForAI(this.lastQueryResults);
            
            const prompt = `Analyze these SQL query results and provide insights. Explain what the data shows, identify any patterns, trends, or notable findings, and provide business context if possible.

SQL Query:
${this.lastExecutedQuery}

Query Results:
${formattedResults}

Current Database: ${this.currentDatabase}

Provide a clear explanation of what these results mean in business terms.`;
            
            const response = await this.callGeminiAPI(apiKey, prompt, '');
            
            if (!response || typeof response !== 'string') {
                throw new Error(`Invalid response from Gemini API: ${typeof response}`);
            }
            
            this.updateAgentResponse(response);
        } catch (error) {
            console.error('Results explanation error:', error);
            this.logSystem(`Results explanation error: ${error.message}`, 'error');
            this.updateAgentResponse(`Results explanation failed: ${error.message}`);
        }
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
            
            // Get current database schema for context
            const schemaContext = this.getSchemaContext();
            
            // Determine if this is creation or modification
            const isModification = existingSql && existingSql.trim().length > 0;
            
            let prompt;
            if (isModification) {
                prompt = `You are an expert SQL developer. Given the database schema and existing SQL query, modify the query according to the user's instruction. Return only the modified SQL query.

Database Schema:
${schemaContext}

Current Database: ${this.currentDatabase}

User Instruction:
${userPrompt}

Existing SQL Query:
${existingSql}

Return only the modified SQL query without any explanation or code block formatting.`;
            } else {
                prompt = `You are an expert SQL developer. Given the database schema, create a new SQL query based on the user's natural language request. Return only the SQL query.

Database Schema:
${schemaContext}

Current Database: ${this.currentDatabase}

User Request:
${userPrompt}

Return only the SQL query without any explanation or code block formatting.`;
            }
            
            const body = {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
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
            let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Extract SQL from code block if present
            const sqlMatch = text.match(/```sql\n([\s\S]*?)```/i) || text.match(/```\n([\s\S]*?)```/i);
            if (sqlMatch) {
                text = sqlMatch[1].trim();
            }
            
            // Clean up any remaining formatting
            text = text.replace(/^```sql\n?/i, '').replace(/\n?```$/i, '').trim();
            
            return text;
        } catch (error) {
            console.error('Gemini SQL generation error:', error);
            this.logSystem(`Gemini SQL generation error: ${error.message}`, 'error');
            throw error;
        }
    }

    async generateSQLFromPrompt() {
        const userPrompt = document.getElementById('sqlPrompt').value.trim();
        const existingSql = this.editor.getValue().trim();
        if (!userPrompt) {
            this.updateAgentResponse('Please enter a natural language request to generate SQL.');
            return;
        }

        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            this.updateAgentResponse('Please enter your API key to use AI features.\n\nGo to https://aistudio.google.com/ to create a key.');
            return;
        }

        const generateBtn = document.getElementById('generateSqlBtn');
        const btnText = document.getElementById('generateBtnText');
        const originalText = btnText.textContent;

        try {
            // Update button state
            generateBtn.disabled = true;
            btnText.textContent = existingSql ? 'Modifying...' : 'Generating...';
            
            const actionType = existingSql ? 'Modifying existing SQL query' : 'Generating new SQL query';
            this.updateAgentResponse(`🤖 ${actionType}...`);
            
            const newSql = await this.callGeminiForSQL(apiKey, userPrompt, existingSql);
            
            if (newSql && newSql.trim()) {
                this.editor.setValue(newSql);
                this.flashEditor();
                this.addToHistory(newSql);
                
                const successMessage = existingSql 
                    ? '✅ SQL query modified successfully! The updated query is now in the editor.'
                    : '✅ SQL query generated successfully! The new query is now in the editor.';
                    
                this.updateAgentResponse(successMessage);
                this.logSystem(`SQL ${existingSql ? 'modified' : 'generated'} successfully`, 'info');
                
                // Clear the prompt after successful generation
                document.getElementById('sqlPrompt').value = '';
            } else {
                this.updateAgentResponse('❌ No SQL was generated. Please try rephrasing your request or check if your API key is valid.');
            }
        } catch (error) {
            this.logSystem(`SQL generation error: ${error.message}`, 'error');
            this.updateAgentResponse(`❌ SQL generation failed: ${error.message}\n\nPlease check your API key and try again.`);
        } finally {
            // Reset button state
            generateBtn.disabled = false;
            btnText.textContent = originalText;
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

    // R4: Basic error detection and auto-fix - validate query before execution
    validateQuery(sql) {
        const upperSql = sql.toUpperCase();
        const errors = [];
        let fixedQuery = sql;
        let hasAutoFix = false;
        
        // Check for unclosed quotes and try to fix
        const singleQuotes = (sql.match(/'/g) || []).length;
        const doubleQuotes = (sql.match(/"/g) || []).length;
        if (singleQuotes % 2 !== 0) {
            errors.push('Unclosed single quote detected');
            // Auto-fix: Add closing quote at the end
            fixedQuery = fixedQuery.trim() + "'";
            hasAutoFix = true;
        }
        if (doubleQuotes % 2 !== 0) {
            errors.push('Unclosed double quote detected');
            // Auto-fix: Add closing quote at the end
            fixedQuery = fixedQuery.trim() + '"';
            hasAutoFix = true;
        }
        
        // Check for unmatched parentheses and try to fix
        let parenCount = 0;
        let parenPositions = [];
        for (let i = 0; i < fixedQuery.length; i++) {
            if (fixedQuery[i] === '(') {
                parenCount++;
                parenPositions.push({type: 'open', pos: i});
            }
            if (fixedQuery[i] === ')') {
                parenCount--;
                parenPositions.push({type: 'close', pos: i});
            }
        }
        
        if (parenCount > 0) {
            errors.push('Unclosed parenthesis detected');
            // Auto-fix: Add closing parentheses
            for (let i = 0; i < parenCount; i++) {
                fixedQuery = fixedQuery.trim() + ')';
            }
            hasAutoFix = true;
        } else if (parenCount < 0) {
            errors.push('Extra closing parenthesis detected');
            // This is harder to auto-fix reliably
        }
        
        // Check for missing semicolon at the end
        if (!fixedQuery.trim().endsWith(';')) {
            // Auto-fix: Add semicolon
            fixedQuery = fixedQuery.trim() + ';';
            // Don't count this as an error, just fix it silently
        }
        
        // Check for common syntax errors
        if ((upperSql.match(/SELECT/g) || []).length !== (upperSql.match(/FROM/g) || []).length) {
            errors.push('Mismatched SELECT/FROM statements');
            // This is complex to auto-fix without context
        }
        
        // Basic schema validation and auto-correction for Chinook
        if (this.currentDatabase === 'Chinook_Sqlite.sqlite') {
            const tables = ['Customer', 'Invoice', 'Track', 'Album', 'Artist', 'Employee', 'Genre', 'MediaType', 'Playlist', 'PlaylistTrack', 'InvoiceLine'];
            const tableMap = {};
            tables.forEach(t => tableMap[t.toLowerCase()] = t);
            
            // Create a regex to find potential table names after FROM and JOIN
            const tableRegex = /(?:FROM|JOIN)\s+([A-Za-z_]\w*)/gi;
            let match;
            let replacements = [];
            
            while ((match = tableRegex.exec(fixedQuery)) !== null) {
                const tableName = match[1];
                const lowerTableName = tableName.toLowerCase();
                
                // Check if it's a valid table (case-insensitive)
                if (tableMap[lowerTableName] && tableName !== tableMap[lowerTableName]) {
                    // Wrong case - fix it
                    replacements.push({
                        original: tableName,
                        replacement: tableMap[lowerTableName],
                        position: match.index + match[0].indexOf(tableName)
                    });
                    errors.push(`Fixed table case: "${tableName}" → "${tableMap[lowerTableName]}"`);
                    hasAutoFix = true;
                } else if (!tableMap[lowerTableName]) {
                    // Try fuzzy matching for typos
                    const closeMatch = tables.find(table => 
                        this.levenshteinDistance(table.toLowerCase(), lowerTableName) <= 2
                    );
                    if (closeMatch) {
                        replacements.push({
                            original: tableName,
                            replacement: closeMatch,
                            position: match.index + match[0].indexOf(tableName)
                        });
                        errors.push(`Fixed typo: "${tableName}" → "${closeMatch}"`);
                        hasAutoFix = true;
                    }
                }
            }
            
            // Apply replacements in reverse order to maintain positions
            replacements.sort((a, b) => b.position - a.position);
            replacements.forEach(r => {
                fixedQuery = fixedQuery.substring(0, r.position) + 
                           r.replacement + 
                           fixedQuery.substring(r.position + r.original.length);
            });
        }
        
        if (errors.length > 0) {
            return {
                isValid: false,
                error: errors.join('; '),
                suggestion: hasAutoFix ? 'Auto-fix available. Click OK to apply.' : 'Check your query for syntax errors.',
                fixedQuery: hasAutoFix ? fixedQuery : null
            };
        }
        
        return { isValid: true };
    }
    
    // Helper function for fuzzy string matching
    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }
    
    // R4: Get suggestions for error messages
    getErrorSuggestion(errorMessage, sql) {
        const suggestions = [];
        
        if (errorMessage.includes('no such table')) {
            const tableName = errorMessage.match(/no such table: (\w+)/i)?.[1];
            if (tableName) {
                suggestions.push(`**Table "${tableName}" not found.**`);
                suggestions.push('Available tables: Use the Schema panel to see all available tables.');
                suggestions.push(`Tip: Table names are case-sensitive in SQLite.`);
            }
        } else if (errorMessage.includes('no such column')) {
            const columnName = errorMessage.match(/no such column: (\w+)/i)?.[1];
            if (columnName) {
                suggestions.push(`**Column "${columnName}" not found.**`);
                suggestions.push('Check the Schema panel for correct column names.');
                suggestions.push('Tip: You might need to specify the table alias (e.g., c.ColumnName)');
            }
        } else if (errorMessage.includes('ambiguous column')) {
            suggestions.push('**Column name is ambiguous.**');
            suggestions.push('Specify which table the column belongs to using table aliases.');
            suggestions.push('Example: SELECT c.Name FROM Customer c');
        } else if (errorMessage.includes('syntax error')) {
            suggestions.push('**SQL syntax error detected.**');
            suggestions.push('Common fixes:');
            suggestions.push('• Check for missing commas between columns');
            suggestions.push('• Ensure all quotes and parentheses are closed');
            suggestions.push('• Verify keyword spelling (SELECT, FROM, WHERE, etc.)');
        }
        
        return suggestions.length > 0 ? suggestions.join('\n') : 'Please check your SQL syntax and try again.';
    }
    
    // R5: Generate follow-up query suggestions based on results
    generateFollowUpSuggestions(sql, results) {
        const suggestions = [];
        const upperSql = sql.toUpperCase();
        
        if (!results || results.length === 0 || !results[0].values || results[0].values.length === 0) {
            suggestions.push('Add more conditions to broaden your search');
            suggestions.push('Check if your WHERE clause is too restrictive');
            return suggestions;
        }
        
        const rowCount = results[0].values.length;
        const hasGroupBy = upperSql.includes('GROUP BY');
        const hasOrderBy = upperSql.includes('ORDER BY');
        const hasLimit = upperSql.includes('LIMIT');
        const hasWhere = upperSql.includes('WHERE');
        const hasJoin = upperSql.includes('JOIN');
        
        // Suggest based on current query structure
        if (!hasOrderBy && rowCount > 1) {
            suggestions.push('Add ORDER BY to sort your results');
        }
        
        if (!hasLimit && rowCount > 20) {
            suggestions.push('Add LIMIT to see top results only');
        }
        
        if (!hasGroupBy && hasJoin) {
            suggestions.push('Add GROUP BY to aggregate your data');
        }
        
        if (hasGroupBy && !upperSql.includes('HAVING')) {
            suggestions.push('Add HAVING clause to filter grouped results');
        }
        
        if (!hasWhere && rowCount > 100) {
            suggestions.push('Add WHERE clause to filter results');
        }
        
        // Context-specific suggestions for Chinook database
        if (this.currentDatabase === 'Chinook_Sqlite.sqlite') {
            if (upperSql.includes('CUSTOMER') && !upperSql.includes('INVOICE')) {
                suggestions.push('Join with Invoice table to see customer purchases');
            }
            
            if (upperSql.includes('TRACK') && !upperSql.includes('ALBUM')) {
                suggestions.push('Join with Album and Artist tables for complete track info');
            }
            
            if (upperSql.includes('INVOICE') && !hasGroupBy) {
                suggestions.push('Group by customer or date to see sales patterns');
            }
        }
        
        // Limit suggestions to top 3 most relevant
        return suggestions.slice(0, 3);
    }

    // Display clickable auto-fix suggestion
    displayAutoFixSuggestion(validationResult) {
        const agentDiv = document.getElementById('agentResponse');
        
        // Remove existing suggestions
        this.removeSuggestionButtons();
        
        // Update agent response with error details
        this.updateAgentResponse(`⚠️ Found issues in your query:\n\n${validationResult.error}\n\nSuggested fix available:`);
        
        // Create suggestion container
        const suggestionContainer = document.createElement('div');
        suggestionContainer.id = 'suggestionContainer';
        suggestionContainer.style.marginTop = '15px';
        suggestionContainer.style.padding = '15px';
        suggestionContainer.style.border = '2px solid #f59e0b';
        suggestionContainer.style.borderRadius = '8px';
        suggestionContainer.style.backgroundColor = '#fffbeb';
        
        suggestionContainer.innerHTML = `
            <div style="margin-bottom: 10px;">
                <strong>🔧 Suggested Fix:</strong>
            </div>
            <pre style="background: #fff; padding: 10px; border-radius: 4px; margin: 10px 0; font-size: 13px; white-space: pre-wrap;">${validationResult.fixedQuery}</pre>
            <div style="display: flex; gap: 10px;">
                <button id="applyFixBtn" class="btn btn-warning" style="flex: 1;">
                    <i class="ti ti-check"></i> Apply Fix & Execute
                </button>
                <button id="ignoreFixBtn" class="btn btn-outline-secondary" style="flex: 1;">
                    <i class="ti ti-x"></i> Ignore & Execute Anyway
                </button>
            </div>
        `;
        
        // Insert after agent response
        agentDiv.parentNode.insertBefore(suggestionContainer, agentDiv.nextSibling);
        
        // Add event listeners
        document.getElementById('applyFixBtn').addEventListener('click', () => {
            this.editor.setValue(validationResult.fixedQuery);
            this.flashEditor();
            this.removeSuggestionButtons();
            this.executeQuery(); // Execute with fixed query
        });
        
        document.getElementById('ignoreFixBtn').addEventListener('click', () => {
            this.removeSuggestionButtons();
            this.executeQuery(); // Execute original query
        });
    }
    
    // Display clickable follow-up suggestions
    displayClickableSuggestions(suggestions, originalQuery) {
        const agentDiv = document.getElementById('agentResponse');
        
        // Remove existing suggestions
        this.removeSuggestionButtons();
        
        // Create suggestion container
        const suggestionContainer = document.createElement('div');
        suggestionContainer.id = 'suggestionContainer';
        suggestionContainer.style.marginTop = '15px';
        suggestionContainer.style.padding = '15px';
        suggestionContainer.style.border = '2px solid #206bc4';
        suggestionContainer.style.borderRadius = '8px';
        suggestionContainer.style.backgroundColor = '#f1f5f9';
        
        let suggestionHTML = `
            <div style="margin-bottom: 15px;">
                <strong>💡 Suggested follow-up queries:</strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        suggestions.forEach((suggestion, idx) => {
            const modifiedQuery = this.applyFollowUpSuggestion(originalQuery, suggestion);
            suggestionHTML += `
                <button class="followup-btn btn btn-outline-primary" 
                        data-query="${modifiedQuery.replace(/"/g, '&quot;')}" 
                        style="text-align: left; padding: 10px; font-size: 14px;">
                    <i class="ti ti-arrow-right"></i> ${suggestion}
                </button>
            `;
        });
        
        suggestionHTML += `
            </div>
            <div style="margin-top: 10px; text-align: center;">
                <button id="dismissSuggestionsBtn" class="btn btn-sm btn-ghost">
                    <i class="ti ti-x"></i> Dismiss
                </button>
            </div>
        `;
        
        suggestionContainer.innerHTML = suggestionHTML;
        
        // Insert after agent response
        agentDiv.parentNode.insertBefore(suggestionContainer, agentDiv.nextSibling);
        
        // Add event listeners
        suggestionContainer.querySelectorAll('.followup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newQuery = btn.getAttribute('data-query');
                this.editor.setValue(newQuery);
                this.flashEditor();
                this.addToHistory(newQuery);
                this.removeSuggestionButtons();
                this.updateAgentResponse('Query updated with suggestion! Click Execute to run it.');
            });
        });
        
        document.getElementById('dismissSuggestionsBtn').addEventListener('click', () => {
            this.removeSuggestionButtons();
        });
    }
    
    // Apply a follow-up suggestion to the original query
    applyFollowUpSuggestion(originalQuery, suggestion) {
        const upperQuery = originalQuery.toUpperCase();
        let modifiedQuery = originalQuery.trim();
        
        // Remove trailing semicolon for modifications
        if (modifiedQuery.endsWith(';')) {
            modifiedQuery = modifiedQuery.slice(0, -1);
        }
        
        if (suggestion.includes('ORDER BY')) {
            if (!upperQuery.includes('ORDER BY')) {
                modifiedQuery += '\nORDER BY 1 DESC';
            }
        } else if (suggestion.includes('LIMIT')) {
            if (!upperQuery.includes('LIMIT')) {
                modifiedQuery += '\nLIMIT 10';
            }
        } else if (suggestion.includes('GROUP BY')) {
            if (!upperQuery.includes('GROUP BY')) {
                // This is complex - just add a comment suggestion
                modifiedQuery += '\n-- Add GROUP BY clause here';
            }
        } else if (suggestion.includes('HAVING')) {
            if (!upperQuery.includes('HAVING')) {
                modifiedQuery += '\nHAVING COUNT(*) > 1';
            }
        } else if (suggestion.includes('WHERE')) {
            if (!upperQuery.includes('WHERE')) {
                modifiedQuery += '\nWHERE 1=1 -- Add your conditions here';
            }
        } else if (suggestion.includes('Join with Invoice')) {
            if (!upperQuery.includes('INVOICE')) {
                const fromMatch = modifiedQuery.match(/FROM\s+(\w+)(\s+\w+)?/i);
                if (fromMatch) {
                    const tableName = fromMatch[1];
                    const alias = fromMatch[2] ? fromMatch[2].trim() : tableName.charAt(0).toLowerCase();
                    if (tableName.toLowerCase() === 'customer') {
                        modifiedQuery += `\nJOIN Invoice i ON ${alias}.CustomerId = i.CustomerId`;
                    }
                }
            }
        } else if (suggestion.includes('Join with Album')) {
            if (!upperQuery.includes('ALBUM')) {
                modifiedQuery += '\nJOIN Album al ON t.AlbumId = al.AlbumId\nJOIN Artist ar ON al.ArtistId = ar.ArtistId';
            }
        }
        
        return modifiedQuery + ';';
    }
    
    // Remove existing suggestion buttons
    removeSuggestionButtons() {
        const existing = document.getElementById('suggestionContainer');
        if (existing) {
            existing.remove();
        }
    }

    clearAll() {
        this.editor.setValue('');
        document.getElementById('results').innerHTML = '<p class="text-muted">Execute a query to see results...</p>';
        document.getElementById('decomposedParts').style.display = 'none';
        document.getElementById('explainResultsBtn').style.display = 'none';
        this.lastQueryResults = null;
        this.lastExecutedQuery = null;
        this.removeSuggestionButtons(); // Remove any existing suggestions
        this.updateAgentResponse('Ready to help with your SQL queries using Gemini 2.5 Flash! 🚀\n\nEnter your Google AI API key to use Explain and NL2SQL features.');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.coquery = new CoQuery();
});

// Export for potential external use
window.CoQuery = CoQuery;
