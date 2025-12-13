# Codeforces Problem Scraper

A Python script using Beautiful Soup to scrape Codeforces problem statements with better mathematical notation handling.

## Installation

```bash
pip install -r requirements.txt
```

## Usage

```bash
python codeforces_scraper.py <codeforces_problem_url>
```

### Example

```bash
python codeforces_scraper.py https://codeforces.com/problemset/problem/1973/H
```

## Features

1. **Better Mathematical Notation Handling**
   - Converts Unicode math symbols to ASCII
   - Removes underscore notation from subscripts (a_1 → a1)
   - Handles superscripts (2k → 2^k)

2. **Clean Text Extraction**
   - Properly handles `<sub>` and `<sup>` tags
   - Removes HTML artifacts
   - Normalizes whitespace

3. **Complete Problem Data**
   - Title
   - Description
   - Input/Output format
   - Constraints
   - Sample test cases
   - Tags and difficulty

## Output Format

The script outputs JSON with the following structure:

```json
{
  "title": "Problem Title",
  "description": "Problem description...",
  "constraints": "Time and memory limits",
  "difficulty": "Easy/Medium/Hard",
  "problemRating": "Rating if available",
  "tags": "tag1, tag2, ...",
  "inputFormat": "Input format description",
  "outputFormat": "Output format description",
  "examples": "Formatted examples",
  "examplesCount": 2,
  "url": "Problem URL"
}
```

## Comparison with JavaScript Version

**Advantages of Python/BeautifulSoup:**
- More reliable HTML parsing
- Better handling of nested structures
- Easier to debug and test
- Can be run independently
- Better string manipulation for mathematical notation

**Note:** This is a standalone script for testing. To integrate with the Chrome extension, you would need to either:
1. Create a backend service that uses this scraper
2. Port the logic back to JavaScript with improvements based on what works here

