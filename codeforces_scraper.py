#!/usr/bin/env python3
"""
Codeforces Problem Scraper using Beautiful Soup
A better alternative to JavaScript DOM scraping for Codeforces problems
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import sys
from typing import Dict, List, Optional
from urllib.parse import urlparse


class CodeforcesScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Unicode to ASCII mapping for mathematical notation
        self.unicode_to_ascii = {
            '𝑎': 'a', '𝑏': 'b', '𝑐': 'c', '𝑑': 'd', '𝑒': 'e', '𝑓': 'f', '𝑔': 'g',
            'ℎ': 'h', '𝑖': 'i', '𝑗': 'j', '𝑘': 'k', '𝑙': 'l', '𝑚': 'm', '𝑛': 'n',
            '𝑜': 'o', '𝑝': 'p', '𝑞': 'q', '𝑟': 'r', '𝑠': 's', '𝑡': 't', '𝑢': 'u',
            '𝑣': 'v', '𝑤': 'w', '𝑥': 'x', '𝑦': 'y', '𝑧': 'z',
            '𝐴': 'A', '𝐵': 'B', '𝐶': 'C', '𝐷': 'D', '𝐸': 'E', '𝐹': 'F', '𝐺': 'G',
            '𝐻': 'H', '𝐼': 'I', '𝐽': 'J', '𝐾': 'K', '𝐿': 'L', '𝑀': 'M', '𝑁': 'N',
            '𝑂': 'O', '𝑃': 'P', '𝑄': 'Q', '𝑅': 'R', '𝑆': 'S', '𝑇': 'T', '𝑈': 'U',
            '𝑉': 'V', '𝑊': 'W', '𝑋': 'X', '𝑌': 'Y', '𝑍': 'Z'
        }
    
    def normalize_math_notation(self, text: str) -> str:
        """Normalize Unicode mathematical notation to ASCII without underscores"""
        if not text:
            return ''
        
        # Convert Unicode math symbols to ASCII
        for unicode_char, ascii_char in self.unicode_to_ascii.items():
            text = text.replace(unicode_char, ascii_char)
        
        # Remove underscore notation from subscripts: a_1 -> a1, s_i -> si
        text = re.sub(r'([a-zA-Z])_(\d+)', r'\1\2', text)  # a_1 -> a1
        text = re.sub(r'([a-zA-Z])_([a-zA-Z])', r'\1\2', text)  # s_i -> si
        text = re.sub(r'([a-zA-Z])_\{([^}]+)\}', r'\1\2', text)  # a_{i_1} -> ai1
        
        # Convert common exponent patterns: 2k -> 2^k, 10n -> 10^n
        text = re.sub(r'(\d+)([kmnKM])(?=\s|$|[−+×/≤≥<>=,\.\)])', 
                     lambda m: f"{m.group(1)}^{m.group(2).lower()}" if int(m.group(1)) <= 100 else m.group(0),
                     text)
        
        return text
    
    def clean_text(self, text: str) -> str:
        """Clean extracted text"""
        if not text:
            return ''
        
        # Remove leading "ss" prefix
        text = re.sub(r'^ss\s+', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^ss(?=[A-Z])', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^smemory\s+', 'memory ', text, flags=re.IGNORECASE)
        
        # Remove LaTeX markers ($$$)
        text = re.sub(r'\$\$\$', '', text)
        text = re.sub(r'\$\$', '', text)
        
        # Convert LaTeX commands to readable format
        text = re.sub(r'\\leq', '≤', text)
        text = re.sub(r'\\geq', '≥', text)
        text = re.sub(r'\\neq', '≠', text)
        text = re.sub(r'\\times', '×', text)
        text = re.sub(r'\\cdot', '·', text)
        text = re.sub(r'\\sum', '∑', text)
        text = re.sub(r'\\prod', '∏', text)
        text = re.sub(r'\\le', '≤', text)
        text = re.sub(r'\\ge', '≥', text)
        text = re.sub(r'\\ldots', '...', text)
        text = re.sub(r'\\dots', '...', text)
        
        # Convert LaTeX superscripts: 2^{20} -> 2^20
        text = re.sub(r'(\d+)\^\{(\d+)\}', r'\1^\2', text)
        
        # Convert LaTeX subscripts: a_{i} -> ai, a_{i+1} -> a{i+1}
        text = re.sub(r'([a-zA-Z])\{([^}]+)\}', r'\1\2', text)
        
        # Remove time/memory limit lines from description
        text = re.sub(r'^time limit per test\s*\d+\s*(second|seconds).*?\n', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^memory limit per test\s*\d+\s*(megabyte|megabytes|mb).*?\n', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^input\s*standard input.*?\n', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^output\s*standard output.*?\n', '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        return text.strip()
    
    def extract_text_from_element(self, element) -> str:
        """Extract text from an element, handling sub/superscripts"""
        if not element:
            return ''
        
        # Process <sub> tags: convert to plain text without underscore
        for sub in element.find_all('sub'):
            sub_text = sub.get_text().strip()
            sub.replace_with(sub_text)  # Replace with plain text
        
        # Process <sup> tags: convert to ^ notation
        for sup in element.find_all('sup'):
            sup_text = sup.get_text().strip()
            sup.replace_with('^' + sup_text)
        
        # Get text content
        text = element.get_text(separator=' ', strip=True)
        
        # Normalize mathematical notation
        text = self.normalize_math_notation(text)
        
        return self.clean_text(text)
    
    def extract_problem_data(self, url: str) -> Optional[Dict]:
        """Extract problem data from Codeforces URL"""
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract title
            title_element = soup.select_one('.title')
            title = title_element.get_text().strip() if title_element else ''
            
            # Extract problem statement
            problem_statement = soup.select_one('.problem-statement')
            if not problem_statement:
                print("Error: Could not find problem statement")
                return None
            
            # Extract description (everything before Input section)
            description_parts = []
            input_section_idx = -1
            
            # Find all direct child divs
            all_divs = problem_statement.select(':scope > div')
            
            # Find where Input section starts
            for i, div in enumerate(all_divs):
                section_title = div.select_one('.section-title')
                if section_title:
                    title_text = section_title.get_text().strip().lower()
                    if 'input' in title_text and input_section_idx == -1:
                        input_section_idx = i
                        break
            
            # Extract description (all divs before Input section)
            description_end = input_section_idx if input_section_idx != -1 else len(all_divs)
            
            for i in range(description_end):
                div = all_divs[i]
                section_title = div.select_one('.section-title')
                
                # Skip section headers
                if section_title:
                    title_text = section_title.get_text().strip().lower()
                    if any(word in title_text for word in ['input', 'output', 'note', 'example']):
                        break
                
                # Extract text from this div
                div_text = self.extract_text_from_element(div)
                
                # Filter out very short text, single letters, and artifacts
                div_text_clean = div_text.strip() if div_text else ''
                
                # Skip if it's just a single letter or very short
                if len(div_text_clean) <= 2:
                    continue
                
                # Skip if it's just "s" or "ss"
                if div_text_clean.lower() in ['s', 'ss']:
                    continue
                
                # Remove leading single letter artifacts
                div_text_clean = re.sub(r'^\s*[sS]\s+', '', div_text_clean)
                
                if div_text_clean and len(div_text_clean) > 10:
                    description_parts.append(div_text_clean)
            
            description = '\n\n'.join(description_parts)
            
            # Remove title from description if it appears at the start
            if title and description.startswith(title):
                description = description[len(title):].strip()
            
            # Remove time/memory limit lines if they appear in description
            description = re.sub(r'time limit per test\s*\d+\s*(second|seconds)', '', description, flags=re.IGNORECASE)
            description = re.sub(r'memory limit per test\s*\d+\s*(megabyte|megabytes|mb)', '', description, flags=re.IGNORECASE)
            description = re.sub(r'input\s*standard input', '', description, flags=re.IGNORECASE)
            description = re.sub(r'output\s*standard output', '', description, flags=re.IGNORECASE)
            
            # Remove leading "ss" or "s" artifacts (more aggressive)
            # Remove from start of string
            description = re.sub(r'^[sS]{1,2}\s+', '', description)
            description = re.sub(r'^[sS]{1,2}\n+', '', description)
            # Remove from start after whitespace
            description = re.sub(r'^\s+[sS]{1,2}\s+', '', description)
            description = re.sub(r'^\s+[sS]{1,2}\n+', '', description)
            # Also remove if it's at the start of a line after newline
            description = re.sub(r'\n\s*[sS]{1,2}\s+', '\n', description)
            description = description.strip()
            
            # Final pass: if description still starts with just "s" or "ss", remove it
            if description and len(description) > 2:
                if description[:2].lower() in ['s ', 'ss']:
                    description = description[2:].strip()
                elif description[0].lower() == 's' and description[1] in [' ', '\n']:
                    description = description[1:].strip()
            
            # Extract input format
            input_spec = problem_statement.select_one('.input-specification')
            input_format = ''
            if input_spec:
                input_text = self.extract_text_from_element(input_spec)
                input_format = re.sub(r'^Input\s*:?\s*', '', input_text, flags=re.IGNORECASE)
            
            # Extract output format
            output_spec = problem_statement.select_one('.output-specification')
            output_format = ''
            if output_spec:
                output_text = self.extract_text_from_element(output_spec)
                output_format = re.sub(r'^Output\s*:?\s*', '', output_text, flags=re.IGNORECASE)
            
            # Extract constraints
            constraints_parts = []
            
            # Time and memory limits
            time_limit = soup.select_one('.time-limit')
            memory_limit = soup.select_one('.memory-limit')
            
            if time_limit:
                constraints_parts.append(time_limit.get_text().strip())
            if memory_limit:
                constraints_parts.append(memory_limit.get_text().strip())
            
            constraints = '\n'.join(constraints_parts)
            
            # Extract Note section
            note_spec = problem_statement.select_one('.note')
            if note_spec and 'Note:' not in description:
                note_text = self.extract_text_from_element(note_spec)
                note_text = re.sub(r'^Note\s*:?\s*', '', note_text, flags=re.IGNORECASE)
                if note_text:
                    description += '\n\nNote: ' + note_text
            
            # Extract sample test cases
            examples = []
            sample_tests = problem_statement.select('.sample-test')
            
            for sample_test in sample_tests:
                inputs = sample_test.select('.input pre')
                outputs = sample_test.select('.output pre')
                
                max_pairs = max(len(inputs), len(outputs))
                
                for i in range(max_pairs):
                    input_el = inputs[i] if i < len(inputs) else None
                    output_el = outputs[i] if i < len(outputs) else None
                    
                    if input_el or output_el:
                        input_text = input_el.get_text() if input_el else ''
                        output_text = output_el.get_text() if output_el else ''
                        
                        # Clean test case text - preserve line breaks properly
                        # Codeforces uses divs for each line in pre tags
                        if input_el:
                            input_lines = []
                            for line_div in input_el.find_all('div', recursive=False):
                                line_text = line_div.get_text().strip()
                                if line_text:
                                    input_lines.append(line_text)
                            if input_lines:
                                input_text = '\n'.join(input_lines)
                            else:
                                input_text = '\n'.join(line.strip() for line in input_text.split('\n') if line.strip())
                        
                        if output_el:
                            output_lines = []
                            for line_div in output_el.find_all('div', recursive=False):
                                line_text = line_div.get_text().strip()
                                if line_text:
                                    output_lines.append(line_text)
                            if output_lines:
                                output_text = '\n'.join(output_lines)
                            else:
                                output_text = '\n'.join(line.strip() for line in output_text.split('\n') if line.strip())
                        
                        examples.append({
                            'index': len(examples) + 1,
                            'input': input_text,
                            'output': output_text
                        })
            
            # Format examples as string
            examples_text = '\n\n'.join([
                f"Example {ex['index']}:\n  Input:\n    {ex['input'].replace(chr(10), chr(10) + '    ')}\n  Output:\n    {ex['output'].replace(chr(10), chr(10) + '    ')}"
                for ex in examples
            ])
            
            # Extract difficulty and tags (try to get from title or API)
            difficulty = 'Unknown'
            if title:
                letter_match = re.match(r'^([A-G])\.', title)
                if letter_match:
                    letter = letter_match.group(1)
                    difficulty_map = {
                        'A': 'Easy', 'B': 'Easy', 'C': 'Medium', 
                        'D': 'Medium', 'E': 'Hard', 'F': 'Hard', 'G': 'Hard'
                    }
                    difficulty = difficulty_map.get(letter, 'Medium')
            
            # Extract tags
            tags = []
            tag_elements = soup.select('.tag-box a, [class*="tag"]')
            for tag_el in tag_elements:
                tag_text = tag_el.get_text().strip()
                # Filter out rating numbers and very long tags
                if tag_text and len(tag_text) < 30 and not re.match(r'^\*?\d+$', tag_text):
                    tags.append(tag_text)
            
            tags_str = ', '.join(tags[:5]) if tags else ''
            
            # Extract problem rating if available
            rating = ''
            rating_el = soup.select_one('.tag-box[title*="Difficulty"], [title*="rating"]')
            if rating_el:
                rating = re.sub(r'\*', '', rating_el.get_text().strip())
            
            # Build result
            result = {
                'title': title,
                'description': description[:5000],  # Limit description length
                'constraints': constraints[:1000],
                'difficulty': difficulty,
                'problemRating': rating,
                'tags': tags_str,
                'inputFormat': input_format[:1000],
                'outputFormat': output_format[:1000],
                'examples': examples_text,
                'examplesCount': len(examples),
                'url': url
            }
            
            return result
            
        except requests.RequestException as e:
            print(f"Error fetching URL: {e}")
            return None
        except Exception as e:
            print(f"Error parsing page: {e}")
            import traceback
            traceback.print_exc()
            return None


def main():
    """Main function to test the scraper"""
    if len(sys.argv) < 2:
        print("Usage: python codeforces_scraper.py <codeforces_problem_url>")
        print("Example: python codeforces_scraper.py https://codeforces.com/problemset/problem/1234/A")
        sys.exit(1)
    
    url = sys.argv[1]
    
    scraper = CodeforcesScraper()
    problem_data = scraper.extract_problem_data(url)
    
    if problem_data:
        print("=" * 80)
        print("EXTRACTED PROBLEM DATA")
        print("=" * 80)
        print(json.dumps(problem_data, indent=2, ensure_ascii=False))
        print("=" * 80)
        print(f"\nDescription length: {len(problem_data['description'])} characters")
        print(f"Examples count: {problem_data['examplesCount']}")
    else:
        print("Failed to extract problem data")
        sys.exit(1)


if __name__ == '__main__':
    main()

