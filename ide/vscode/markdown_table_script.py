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

# Example usage with different data
if __name__ == "__main__":
    sample_data = [
        {"Fruit": "Apple", "Color": "Red", "Price": 1.50},
        {"Fruit": "Banana", "Color": "Yellow", "Price": 0.75},
        {"Fruit": "Orange", "Color": "Orange", "Price": 1.25}
    ]
    
    print(generate_markdown_table(sample_data))