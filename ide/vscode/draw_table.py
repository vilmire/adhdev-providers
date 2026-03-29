#!/usr/bin/env python3
"""
Script to generate and display a markdown table.
This script creates a sample markdown table and prints it.
"""

def create_markdown_table(headers, rows):
    """
    Create a markdown table from headers and rows.
    
    Args:
        headers (list): List of column headers
        rows (list of lists): List of rows, each row is a list of values
    
    Returns:
        str: Markdown formatted table
    """
    if not headers or not rows:
        return "No data to display"
    
    # Header row
    table = "| " + " | ".join(headers) + " |\n"
    
    # Separator row
    table += "| " + " | ".join(["---"] * len(headers)) + " |\n"
    
    # Data rows
    for row in rows:
        table += "| " + " | ".join(str(cell) for cell in row) + " |\n"
    
    return table

if __name__ == "__main__":
    # Sample data for the table
    headers = ["Product", "Price", "Quantity", "Total"]
    rows = [
        ["Apple", "$1.50", 5, "$7.50"],
        ["Banana", "$0.75", 3, "$2.25"],
        ["Orange", "$1.25", 2, "$2.50"]
    ]
    
    # Generate and print the table
    table = create_markdown_table(headers, rows)
    print("Generated Markdown Table:")
    print(table)