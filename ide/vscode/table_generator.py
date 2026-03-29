def generate_markdown_table(data):
    """
    Generate a markdown table from a list of dictionaries.
    Each dictionary represents a row, with keys as headers.
    """
    if not data:
        return ""
    
    # Get headers from the first row
    headers = list(data[0].keys())
    
    # Create header row
    table = "| " + " | ".join(headers) + " |\n"
    
    # Create separator row
    table += "| " + " | ".join(["---"] * len(headers)) + " |\n"
    
    # Create data rows
    for row in data:
        table += "| " + " | ".join(str(row.get(h, "")) for h in headers) + " |\n"
    
    return table

# Example usage
if __name__ == "__main__":
    sample_data = [
        {"Name": "Alice", "Age": 25, "City": "New York"},
        {"Name": "Bob", "Age": 30, "City": "San Francisco"},
        {"Name": "Charlie", "Age": 35, "City": "Chicago"}
    ]
    
    print(generate_markdown_table(sample_data))