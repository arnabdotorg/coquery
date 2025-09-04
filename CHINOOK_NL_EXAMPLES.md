# Natural Language SQL Examples for Chinook Database

## R1: Ad-hoc Query Creation via Natural Language
*Enter these in the "Natural Language to SQL" text area with NO existing SQL in the editor*

### Example 1: Basic Aggregation
**Input:** "Show me the top 10 customers who spent the most money"
**Expected SQL:**
```sql
SELECT c.FirstName, c.LastName, c.Email, SUM(i.Total) as TotalSpent
FROM Customer c
JOIN Invoice i ON c.CustomerId = i.CustomerId
GROUP BY c.CustomerId, c.FirstName, c.LastName, c.Email
ORDER BY TotalSpent DESC
LIMIT 10
```

### Example 2: Complex Join Query
**Input:** "Find all rock songs that are longer than 5 minutes with their artists and album names"
**Expected SQL:**
```sql
SELECT t.Name as TrackName, ar.Name as ArtistName, al.Title as AlbumTitle, 
       t.Milliseconds/60000.0 as Minutes
FROM Track t
JOIN Album al ON t.AlbumId = al.AlbumId
JOIN Artist ar ON al.ArtistId = ar.ArtistId
JOIN Genre g ON t.GenreId = g.GenreId
WHERE g.Name = 'Rock' 
  AND t.Milliseconds > 300000
ORDER BY t.Milliseconds DESC
```

### Example 3: Employee Performance
**Input:** "Which sales support agent generated the most revenue in 2013?"
**Expected SQL:**
```sql
SELECT e.FirstName, e.LastName, e.Title, 
       COUNT(DISTINCT c.CustomerId) as CustomerCount,
       SUM(i.Total) as TotalRevenue
FROM Employee e
JOIN Customer c ON e.EmployeeId = c.SupportRepId
JOIN Invoice i ON c.CustomerId = i.CustomerId
WHERE e.Title = 'Sales Support Agent'
  AND strftime('%Y', i.InvoiceDate) = '2013'
GROUP BY e.EmployeeId, e.FirstName, e.LastName, e.Title
ORDER BY TotalRevenue DESC
```

### Example 4: Geographic Analysis
**Input:** "Show me total sales by country for countries with more than 100 dollars in sales"
**Expected SQL:**
```sql
SELECT BillingCountry, 
       COUNT(*) as InvoiceCount,
       SUM(Total) as TotalSales
FROM Invoice
GROUP BY BillingCountry
HAVING SUM(Total) > 100
ORDER BY TotalSales DESC
```

### Example 5: Product Analysis
**Input:** "List the most popular genres by number of tracks sold"
**Expected SQL:**
```sql
SELECT g.Name as GenreName, 
       COUNT(il.InvoiceLineId) as TracksSold,
       SUM(il.Quantity * il.UnitPrice) as Revenue
FROM Genre g
JOIN Track t ON g.GenreId = t.GenreId
JOIN InvoiceLine il ON t.TrackId = il.TrackId
GROUP BY g.GenreId, g.Name
ORDER BY TracksSold DESC
```

---

## R2: Explanation of SQL Queries and Results
*Click "Explain Query" button after having SQL in the editor, or "Explain Results" after executing*

### Example 1: Explain Complex Join
**SQL to Explain:**
```sql
SELECT c.FirstName, c.LastName, COUNT(DISTINCT al.AlbumId) as UniqueAlbums
FROM Customer c
JOIN Invoice i ON c.CustomerId = i.CustomerId
JOIN InvoiceLine il ON i.InvoiceId = il.InvoiceId
JOIN Track t ON il.TrackId = t.TrackId
JOIN Album al ON t.AlbumId = al.AlbumId
GROUP BY c.CustomerId
HAVING COUNT(DISTINCT al.AlbumId) > 10
```
**Expected Explanation:** "This query finds customers who have purchased tracks from more than 10 different albums. It joins customers through their invoices to invoice lines, then to tracks and albums, counting distinct albums per customer."

### Example 2: Explain Subquery
**SQL to Explain:**
```sql
SELECT * FROM Artist
WHERE ArtistId IN (
    SELECT ArtistId FROM Album
    GROUP BY ArtistId
    HAVING COUNT(*) > 5
)
```
**Expected Explanation:** "This query finds all artists who have released more than 5 albums. The subquery groups albums by artist and filters for those with more than 5 albums, then the main query retrieves full artist details."

### Example 3: Explain Window Function (if supported)
**SQL to Explain:**
```sql
SELECT FirstName, LastName, Country,
       COUNT(*) OVER (PARTITION BY Country) as CountryCustomerCount
FROM Customer
```
**Expected Explanation:** "This query lists all customers and shows how many total customers are from the same country. The window function counts customers partitioned by country without grouping the results."

### Example 4: Explain EXISTS Clause
**SQL to Explain:**
```sql
SELECT * FROM Employee e
WHERE EXISTS (
    SELECT 1 FROM Customer c
    WHERE c.SupportRepId = e.EmployeeId
    AND c.Country = 'Canada'
)
```
**Expected Explanation:** "This query finds all employees who support at least one customer from Canada. The EXISTS clause checks if there's any Canadian customer assigned to each employee."

### Example 5: Explain Results
**After executing a query that returns sales data:**
**Expected Explanation:** "The results show that USA leads in sales with $523.06, followed by Canada with $303.96. There's a significant drop-off after the top 5 countries, suggesting concentrated market presence in North America."

---

## R3: Modifying Existing Queries via Natural Language
*First have an existing SQL query in the editor, then enter modification request*

### Example 1: Add Filtering
**Existing SQL:**
```sql
SELECT * FROM Track
```
**Modification Request:** "Add a filter to show only tracks longer than 3 minutes"
**Expected Modified SQL:**
```sql
SELECT * FROM Track
WHERE Milliseconds > 180000
```

### Example 2: Add Sorting and Limiting
**Existing SQL:**
```sql
SELECT FirstName, LastName, Email FROM Customer
```
**Modification Request:** "Sort by last name and show only the first 20"
**Expected Modified SQL:**
```sql
SELECT FirstName, LastName, Email FROM Customer
ORDER BY LastName
LIMIT 20
```

### Example 3: Add Aggregation
**Existing SQL:**
```sql
SELECT InvoiceId, CustomerId, Total FROM Invoice
```
**Modification Request:** "Group by customer and show total amount spent"
**Expected Modified SQL:**
```sql
SELECT CustomerId, SUM(Total) as TotalSpent, COUNT(*) as InvoiceCount
FROM Invoice
GROUP BY CustomerId
ORDER BY TotalSpent DESC
```

### Example 4: Add Join
**Existing SQL:**
```sql
SELECT Name, Milliseconds FROM Track
```
**Modification Request:** "Include the album and artist names"
**Expected Modified SQL:**
```sql
SELECT t.Name, t.Milliseconds, al.Title as AlbumTitle, ar.Name as ArtistName
FROM Track t
JOIN Album al ON t.AlbumId = al.AlbumId
JOIN Artist ar ON al.ArtistId = ar.ArtistId
```

### Example 5: Change Aggregation Function
**Existing SQL:**
```sql
SELECT Country, COUNT(*) as CustomerCount
FROM Customer
GROUP BY Country
```
**Modification Request:** "Also show the list of customer names for each country"
**Expected Modified SQL:**
```sql
SELECT Country, 
       COUNT(*) as CustomerCount,
       GROUP_CONCAT(FirstName || ' ' || LastName, ', ') as CustomerNames
FROM Customer
GROUP BY Country
ORDER BY CustomerCount DESC
```

---

## How to Test These Examples

1. **For R1 (Creation)**: 
   - Clear the SQL editor
   - Enter the natural language prompt in the "Natural Language to SQL" text area
   - Click "Generate SQL"
   - The SQL should appear in the editor

2. **For R2 (Explanation)**:
   - Paste or generate SQL in the editor
   - Click "Explain Query" to understand the SQL
   - Execute the query and click "Explain Results" to get insights about the data

3. **For R3 (Modification)**:
   - Have existing SQL in the editor
   - Enter the modification request in the "Natural Language to SQL" text area
   - Click "Generate SQL" (button will say "Modifying...")
   - The modified SQL replaces the existing query

**Note:** All features require a Google AI API key from https://aistudio.google.com/