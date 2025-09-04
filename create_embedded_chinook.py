#!/usr/bin/env python3
"""
Create embedded Chinook database JavaScript file
"""

import base64
import os

def create_embedded_chinook():
    # Read the Chinook database file
    db_path = "data/Chinook_Sqlite.sqlite"
    
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found")
        return False
    
    with open(db_path, "rb") as f:
        db_bytes = f.read()
    
    # Convert to base64
    db_base64 = base64.b64encode(db_bytes).decode('ascii')
    
    print(f"Database size: {len(db_bytes):,} bytes")
    print(f"Base64 size: {len(db_base64):,} characters")
    
    # Create JavaScript file with embedded database
    js_content = f"""// Embedded Chinook Database
// Auto-generated file - DO NOT EDIT
// Database size: {len(db_bytes):,} bytes

window.CHINOOK_DATABASE = `{db_base64}`;

function loadEmbeddedChinookDirect() {{
    try {{
        // SQL.js should be available globally after being set by CoQuery
        if (!window.SQL || !window.SQL.Database) {{
            console.error('SQL.js not loaded - make sure CoQuery has initialized SQL.js');
            return null;
        }}
        
        console.log('Converting Chinook base64 to database...');
        // Convert base64 to Uint8Array
        const binaryString = atob(window.CHINOOK_DATABASE);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {{
            bytes[i] = binaryString.charCodeAt(i);
        }}
        
        // Create database using the SQL.js that CoQuery loaded
        const db = new window.SQL.Database(bytes);
        console.log('Chinook database loaded from embedded data successfully');
        return db;
    }} catch (error) {{
        console.error('Failed to load embedded Chinook:', error);
        return null;
    }}
}}

window.loadEmbeddedChinookDirect = loadEmbeddedChinookDirect;
"""
    
    # Write the JavaScript file
    output_path = "chinook_embedded.js"
    with open(output_path, "w") as f:
        f.write(js_content)
    
    print(f"Created {output_path}")
    return True

if __name__ == "__main__":
    create_embedded_chinook()