/**
 * LC Helper - Problem Capture Test Script
 * 
 * HOW TO USE:
 * 1. Navigate to a problem page (LeetCode, Codeforces, or CodeChef)
 * 2. Open DevTools Console (F12 or Cmd+Option+I)
 * 3. Copy and paste this entire script into the console
 * 4. Press Enter to run the test
 * 
 * The script will:
 * - Extract problem data using the same logic as the extension
 * - Validate the extraction results
 * - Generate a detailed report
 * - Show any issues or missing fields
 */

(function() {
  'use strict';
  
  console.log('🧪 LC Helper - Problem Capture Test');
  console.log('='.repeat(60));
  
  // Detect platform
  function detectPlatform() {
    const url = window.location.href;
    if (url.includes('leetcode.com')) return 'leetcode';
    if (url.includes('codeforces.com')) return 'codeforces';
    if (url.includes('codechef.com')) return 'codechef';
    return 'unknown';
  }
  
  const platform = detectPlatform();
  console.log(`📍 Platform: ${platform}`);
  console.log(`🔗 URL: ${window.location.href}`);
  console.log('-'.repeat(60));
  
  if (platform === 'unknown') {
    console.error('❌ Unknown platform. Please navigate to LeetCode, Codeforces, or CodeChef.');
    return;
  }
  
  // Test extraction function based on platform
  async function testExtraction() {
    try {
      let extractedData = null;
      
      // Simulate the extraction function from the content script
      if (platform === 'codeforces') {
        // Codeforces extraction test
        const titleEl = document.querySelector('.title');
        const problemStatement = document.querySelector('.problem-statement');
        
        if (!titleEl || !problemStatement) {
          console.error('❌ Could not find problem elements. Is this a problem page?');
          return;
        }
        
        let description = '';
        let constraints = '';
        let inputFormat = '';
        let outputFormat = '';
        
        // Helper function to clean LaTeX duplication patterns
        function cleanLatexDuplication(text) {
          if (!text) return '';
          
          // Remove leading "ss" or other common prefixes (with or without space)
          text = text.replace(/^ss\s*/, '');
          
          // Map Unicode math symbols to their ASCII equivalents
          const unicodeToAscii = {
            '𝑠': 's', '𝑡': 't', '𝑛': 'n', '𝑖': 'i', '𝑎': 'a', 'ℎ': 'h', '𝑚': 'm'
          };
          
          // Pattern 1: Remove Unicode math symbol followed by ASCII equivalent
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            // Simple pattern: unicode + ascii (one or more) -> unicode
            text = text.replace(new RegExp(`(${unicode})(${ascii})+`, 'g'), '$1');
            
            // Pattern with operators: "𝑛×n×n" -> "𝑛×𝑛"
            const operatorPatterns = [
              new RegExp(`(${unicode})([×≤≥≠−＋])\\s*(${ascii})\\s*\\2\\s*(${ascii})`, 'g'),
              new RegExp(`(${unicode})([×≤≥≠−＋])(${ascii})\\2(${ascii})`, 'g'),
            ];
            operatorPatterns.forEach(regex => {
              text = text.replace(regex, (match, u, op, a1, a2) => {
                return u + op + u;
              });
            });
          });
          
          // Pattern 1b: Handle "𝑛×n×n" -> "𝑛×𝑛" more directly
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            const patterns = [
              new RegExp(`(${unicode})([×])([${ascii}])\\2([${ascii}])`, 'g'),
              new RegExp(`(${unicode})([×≤≥≠−＋])([${ascii}])\\2([${ascii}])`, 'g'),
            ];
            patterns.forEach(regex => {
              text = text.replace(regex, '$1$2$1');
            });
          });
          
          // Pattern 2: Handle subscript patterns like "ℎ𝑖hi" -> "ℎ𝑖"
          Object.keys(unicodeToAscii).forEach(u1 => {
            const a1 = unicodeToAscii[u1];
            Object.keys(unicodeToAscii).forEach(u2 => {
              const a2 = unicodeToAscii[u2];
              const pattern = new RegExp(`(${u1})(${u2})(${a1})(${a2})`, 'g');
              text = text.replace(pattern, '$1$2');
            });
          });
          
          // Pattern 3: Handle expressions like "1≤𝑖<𝑛1≤i<n" -> "1≤𝑖<𝑛"
          text = text.replace(/(\d+)([≤≥<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])([≤≥<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([≤≥<>=])([a-z])([≤≥<>=])([a-z])/g, 
            (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
              if (n1 === n2 && op1 === op3 && op2 === op4 && 
                  unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
                return n1 + op1 + u1 + op2 + u2;
              }
              return match;
            });
          
          // Pattern 3b: Handle expressions like "1<𝑖<𝑛1<i<n" -> "1<𝑖<𝑛" (without numbers at end)
          text = text.replace(/(\d+)([<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])([<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([<>=])([a-z])([<>=])([a-z])/g, 
            (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
              if (n1 === n2 && op1 === op3 && op2 === op4 && 
                  unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
                return n1 + op1 + u1 + op2 + u2;
              }
              return match;
            });
          
          // Pattern 3c: Handle expressions like "1≤𝑖≤𝑛1≤i≤n" -> "1≤𝑖≤𝑛"
          text = text.replace(/(\d+)([≤≥])([𝑛𝑖𝑎ℎ𝑠𝑡])([≤≥])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([≤≥])([a-z])([≤≥])([a-z])/g, 
            (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
              if (n1 === n2 && op1 === op3 && op2 === op4 && 
                  unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
                return n1 + op1 + u1 + op2 + u2;
              }
              return match;
            });
          
          // Pattern 4: Handle superscripts - detect "1018" and convert to "10^18"
          text = text.replace(/([−]?)10(\d{1,3})(?![0-9])/g, (match, sign, exp) => {
            if (exp.length <= 3 && parseInt(exp) > 0) {
              return (sign || '') + '10^' + exp;
            }
            return match;
          });
          
          // Pattern 4b: Handle "5×105" -> "5×10^5"
          text = text.replace(/(\d+)×10(\d)/g, (match, base, exp) => {
            return base + '×10^' + exp;
          });
          
          // Pattern 4c: Handle Unicode superscripts
          const superscriptMap = {
            '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0'
          };
          Object.keys(superscriptMap).forEach(sup => {
            const num = superscriptMap[sup];
            text = text.replace(new RegExp(`10${sup}`, 'g'), `10^${num}`);
            const multiSupPattern = new RegExp(`10([¹²³⁴⁵⁶⁷⁸⁹⁰]+)`, 'g');
            text = text.replace(multiSupPattern, (match, sups) => {
              const exp = sups.split('').map(s => superscriptMap[s] || '').join('');
              return `10^${exp}`;
            });
          });
          
          // Pattern 5: Handle patterns like "𝑛−1n−1" -> "𝑛−1"
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            const pattern = new RegExp(`(${unicode})([−＋])(\\d+)(${ascii})\\2(\\d+)`, 'g');
            text = text.replace(pattern, (match, u, op, n1, a, n2) => {
              if (n1 === n2) return u + op + n1;
              return match;
            });
          });
          
          // Pattern 5b: Handle patterns like "(𝑛−1)(n−1)" -> "(𝑛−1)"
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            const pattern = new RegExp(`\\((${unicode})([−＋])(\\d+)\\)\\((${ascii})\\2(\\d+)\\)`, 'g');
            text = text.replace(pattern, (match, u, op, n1, a, n2) => {
              if (n1 === n2) return `(${u}${op}${n1})`;
              return match;
            });
          });
          
          // Pattern 6: Handle patterns like "𝑎𝑖ai" -> "𝑎𝑖"
          Object.keys(unicodeToAscii).forEach(u1 => {
            const a1 = unicodeToAscii[u1];
            Object.keys(unicodeToAscii).forEach(u2 => {
              const a2 = unicodeToAscii[u2];
              const pattern = new RegExp(`(${u1})(${u2})(${a1})(${a2})(?![a-z])`, 'g');
              text = text.replace(pattern, '$1$2');
            });
          });
          
          // Pattern 6b: Handle "𝑛=300000n=300000" -> "𝑛=300000"
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            text = text.replace(new RegExp(`(${unicode})=([^=]+)(${ascii})=\\2`, 'g'), '$1=$2');
            text = text.replace(new RegExp(`(${unicode})\\s*=\\s*([^=\\s]+)\\s*(${ascii})\\s*=\\s*\\2`, 'g'), '$1=$2');
          });
          
          // Get unicode characters string once for use in multiple patterns
          const unicodeChars = Object.keys(unicodeToAscii).join('');
          
          // Pattern 6c: Handle patterns like "𝑎1,𝑎2,…,𝑎𝑛a1,a2,…,an" -> "𝑎1,𝑎2,…,𝑎𝑛"
          // Match: unicode sequence pattern followed by ASCII version
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            // Pattern: ...unicode + comma/ellipsis + unicode + ascii + comma/ellipsis + ascii
            const unicodePattern = `[${unicodeChars}\\d,]+`;
            text = text.replace(new RegExp(`(${unicodePattern})(${unicode})([a-z\\d,]+)(${ascii})`, 'g'), 
              (match, before1, u, before2, a) => {
                // Check if before1 and before2 are similar (same structure)
                // Remove unicode chars and keep only digits/commas
                const clean1 = before1.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^0-9,]/g, '');
                const clean2 = before2.replace(/[a-z]/g, '').replace(/[^0-9,]/g, '');
                if (clean1 === clean2) {
                  return before1 + u; // Keep unicode version
                }
                return match;
              });
          });
          
          // Pattern 6c2: More aggressive pattern for "𝑎1,𝑎2,…,𝑎𝑛a1,a2,…,an" -> "𝑎1,𝑎2,…,𝑎𝑛"
          // Match sequences ending with unicode variable followed by same in ASCII
          Object.keys(unicodeToAscii).forEach(unicode => {
            const ascii = unicodeToAscii[unicode];
            // Match: unicode sequence ending with unicode var, followed by ASCII sequence ending with ASCII var
            const pattern = new RegExp(`([${unicodeChars}\\d,]+${unicode})([a-z\\d,]+${ascii})`, 'g');
            text = text.replace(pattern, (match, unicodeSeq, asciiSeq) => {
              // Extract just the numeric/structural part
              const unicodeNums = unicodeSeq.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^0-9,]/g, '');
              const asciiNums = asciiSeq.replace(/[a-z]/g, '').replace(/[^0-9,]/g, '');
              if (unicodeNums === asciiNums) {
                return unicodeSeq; // Keep unicode version
              }
              return match;
            });
          });
          
          // Pattern 6d: Handle patterns like "|𝑎𝑖−𝑎𝑖−1|<|𝑎𝑖+1−𝑎𝑖||ai−ai−1|<|ai+1−ai|" -> "|𝑎𝑖−𝑎𝑖−1|<|𝑎𝑖+1−𝑎𝑖|"
          // Match: expression with unicode + same expression with ASCII
          text = text.replace(/(\|[^|]+\|)(\|[^|]+\|)/g, (match, expr1, expr2) => {
            // Check if expr2 is ASCII version of expr1
            const expr1Clean = expr1.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^a-z0-9|−+<>≤≥=]/g, '');
            const expr2Clean = expr2.replace(/[a-z]/g, '').replace(/[^a-z0-9|−+<>≤≥=]/g, '');
            if (expr1Clean === expr2Clean && expr1.includes('𝑎') && expr2.includes('a')) {
              return expr1; // Keep unicode version
            }
            return match;
          });
          
          // Pattern 6e: Handle patterns like "[1,1,3,6,10,3,11,1][1,1,3,6,10,3,11,1]" -> "[1,1,3,6,10,3,11,1]"
          text = text.replace(/(\[[^\]]+\])\1/g, '$1');
          
          // Pattern 6f: Handle patterns like "0,2,3,4,7,8,100,2,3,4,7,8,10" -> "0,2,3,4,7,8,10"
          text = text.replace(/(\d+(?:,\d+)+),\1/g, '$1');
          
          // Pattern 6g: Handle number duplication like "55" when it should be "5"
          // But be careful - only fix obvious duplications in context
          // Match: single digit repeated 2+ times when followed by text like "different values"
          text = text.replace(/(\d)\1+(?=\s*(?:different|distinct|values|points|elements))/g, '$1');
          
          // Pattern 6h: Handle "−1018≤𝑎𝑖≤1018−1018≤ai≤1018" -> "−10^18≤𝑎𝑖≤10^18"
          // First convert 1018 to 10^18, then remove duplication
          // This pattern handles constraint expressions with duplication
          text = text.replace(new RegExp(`([−]?10\\^\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(10\\^\\d+)([−]?10\\^\\d+)\\2([a-z]+)\\4(10\\^\\d+)`, 'g'), 
            (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
              // Check if it's a duplication
              if (val1 === val1Dup && val2 === val2Dup && 
                  unicodeToAscii[var1] === var1Dup) {
                return val1 + op1 + var1 + op2 + val2;
              }
              return match;
            });
          
          // Pattern 6h2: Handle simpler case "−1018≤𝑎𝑖≤1018−1018≤ai≤1018" before superscript conversion
          // Match: constraint expression + same expression in ASCII
          text = text.replace(new RegExp(`([−]?\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(\\d+)([−]?\\d+)\\2([a-z]+)\\4(\\d+)`, 'g'),
            (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
              if (val1 === val1Dup && val2 === val2Dup && 
                  unicodeToAscii[var1] === var1Dup) {
                return val1 + op1 + var1 + op2 + val2;
              }
              return match;
            });
          
          // Pattern 6h3: Handle "−10^18≤𝑎𝑖≤10^18−10^18≤ai≤10^18" after superscript conversion
          // Match: constraint expression with superscript + same expression in ASCII
          text = text.replace(new RegExp(`([−]?10\\^\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(10\\^\\d+)([−]?10\\^\\d+)\\2([a-z]+)\\4(10\\^\\d+)`, 'g'),
            (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
              if (val1 === val1Dup && val2 === val2Dup && 
                  unicodeToAscii[var1] === var1Dup) {
                return val1 + op1 + var1 + op2 + val2;
              }
              return match;
            });
          
          // Pattern 6i: Handle thousands separator - "300000" -> "300 000" (but only in specific contexts)
          // Only apply to numbers that appear in test case descriptions like "n = 300000"
          text = text.replace(/([𝑛𝑚])\s*=\s*(\d{4,})/g, (match, variable, num) => {
            if (num.length >= 4) {
              return variable + ' = ' + num.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            }
            return match;
          });
          
          // Pattern 7: Handle triple repetition
          text = text.replace(/(\d{4,})\1{2,}/g, '$1');
          
          // Pattern 8: Handle simple word duplication
          text = text.replace(/([A-Za-z]{2,15})\1{1,}(?=\s|$|[.,;:!?])/g, '$1');
          
          // Pattern 9: Fix word boundary issues
          const wordFixes = {
            'cel': 'cell',
            'unles': 'unless',
            'Al tiles': 'All tiles',
            'al tiles': 'all tiles',
            'Al ': 'All ',
            'al ': 'all ',
            'equall to': 'equal to'
          };
          Object.keys(wordFixes).forEach(wrong => {
            const correct = wordFixes[wrong];
            text = text.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
          });
          
          // Pattern 10: Clean up constraints duplication
          // Remove duplicate "time limit per test" lines (handle with or without newlines)
          text = text.replace(/(time limit per test[^\n]+)(\s*\n?\s*)\1/g, '$1');
          text = text.replace(/(memory limit per test[^\n]+)(\s*\n?\s*)\1/g, '$1');
          // Also handle cases where they appear on same line
          text = text.replace(/(time limit per test[^\n]+)\s+\1/g, '$1');
          text = text.replace(/(memory limit per test[^\n]+)\s+\1/g, '$1');
          
          // Clean up multiple spaces
          text = text.replace(/\s{2,}/g, ' ');
          
          // Clean up multiple newlines
          text = text.replace(/\n{3,}/g, '\n\n');
          
          return text.trim();
        }
        
        // Helper function to extract formatted text
        function extractFormattedText(element, useInnerText = true) {
          if (!element) return '';
          const clone = element.cloneNode(true);
          clone.querySelectorAll('.section-title').forEach(el => el.remove());
          clone.querySelectorAll('script, style').forEach(el => el.remove());
          
          // Use innerText for visible text (avoids LaTeX source duplication)
          let text = '';
          if (useInnerText && clone.innerText) {
            text = clone.innerText.trim();
          } else {
            text = clone.textContent.trim();
          }
          
          // Clean LaTeX duplication patterns
          text = cleanLatexDuplication(text);
          
          // Normalize line breaks
          text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          text = text.replace(/\n{3,}/g, '\n\n');
          
          return text;
        }
        
        // Extract description
        const allDivs = Array.from(problemStatement.querySelectorAll(':scope > div'));
        const descriptionParts = [];
        let inputSectionIndex = -1;
        let outputSectionIndex = -1;
        
        allDivs.forEach((div, index) => {
          const sectionTitle = div.querySelector('.section-title');
          if (sectionTitle) {
            const titleText = sectionTitle.textContent.trim().toLowerCase();
            if (titleText.includes('input') && inputSectionIndex === -1) {
              inputSectionIndex = index;
            }
            if (titleText.includes('output') && outputSectionIndex === -1) {
              outputSectionIndex = index;
            }
          }
        });
        
        const descriptionEndIndex = inputSectionIndex !== -1 ? inputSectionIndex : 
                                    (outputSectionIndex !== -1 ? outputSectionIndex : allDivs.length);
        
        for (let i = 0; i < descriptionEndIndex; i++) {
          const div = allDivs[i];
          const sectionTitle = div.querySelector('.section-title');
          
          if (sectionTitle) {
            const titleText = sectionTitle.textContent.trim().toLowerCase();
            if (titleText.includes('input') || titleText.includes('output') || 
                titleText.includes('note') || titleText.includes('example')) {
              break;
            }
          }
          
          const divText = extractFormattedText(div);
          if (divText.trim()) {
            descriptionParts.push(divText.trim());
          }
        }
        
        description = descriptionParts.join('\n\n');
        description = cleanLatexDuplication(description);
        
        // Remove title if it appears at the start of description
        if (titleEl) {
          const titleText = titleEl.textContent.trim();
          if (description.startsWith(titleText)) {
            description = description.substring(titleText.length).trim();
          }
        }
        
        // Remove time/memory limit lines if they appear in description
        description = description.replace(/time limit per test\s*\d+\s*(second|seconds)/gi, '').trim();
        description = description.replace(/memory limit per test\s*\d+\s*(megabyte|megabytes|mb)/gi, '').trim();
        description = description.replace(/input\s*standard input/gi, '').trim();
        description = description.replace(/output\s*standard output/gi, '').trim();
        
        // Fallback if description is too short
        if (!description || description.trim().length < 100) {
          const problemText = problemStatement.innerText || problemStatement.textContent || '';
          const inputMatch = problemText.match(/Input\s*:?\s*/i);
          if (inputMatch) {
            description = cleanLatexDuplication(problemText.substring(0, inputMatch.index).trim());
          }
        }
        
        // Extract input/output
        const inputSpec = problemStatement.querySelector('.input-specification');
        if (inputSpec) {
          const inputText = extractFormattedText(inputSpec);
          inputFormat = inputText.replace(/^Input\s*:?\s*/i, '').trim();
        }
        
        const outputSpec = problemStatement.querySelector('.output-specification');
        if (outputSpec) {
          const outputText = extractFormattedText(outputSpec);
          outputFormat = outputText.replace(/^Output\s*:?\s*/i, '').trim();
        }
        
        // Extract constraints separately
        const constraintParts = [];
        const timeLimit = document.querySelector('.time-limit');
        const memoryLimit = document.querySelector('.memory-limit');
        if (timeLimit) constraintParts.push(timeLimit.textContent.trim());
        if (memoryLimit) constraintParts.push(memoryLimit.textContent.trim());
        
        // Extract constraints from input format if available
        if (inputFormat && constraintParts.length === 0) {
          const constraintMatches = inputFormat.match(/\d+\s*≤\s*[^≤]+≤\s*\d+/g);
          if (constraintMatches && constraintMatches.length > 0) {
            constraintParts.push(...constraintMatches);
          }
        }
        
        constraints = constraintParts.join('\n');
        
        // Extract examples
        const examples = [];
        const sampleTests = document.querySelectorAll('.sample-test');
        
        function extractPreText(preEl) {
          if (!preEl) return '';
          const divs = preEl.querySelectorAll('div');
          if (divs.length > 0) {
            return Array.from(divs).map(d => {
              const text = d.innerText || d.textContent || '';
              return cleanLatexDuplication(text.trim());
            }).join('\n');
          }
          if (preEl.innerText) {
            return cleanLatexDuplication(preEl.innerText.trim());
          }
          return cleanLatexDuplication(preEl.textContent.trim());
        }
        
        sampleTests.forEach((sampleTest) => {
          const inputs = sampleTest.querySelectorAll('.input pre');
          const outputs = sampleTest.querySelectorAll('.output pre');
          const maxPairs = Math.max(inputs.length, outputs.length);
          
          for (let i = 0; i < maxPairs; i++) {
            const inputEl = inputs[i];
            const outputEl = outputs[i];
            
            if (inputEl || outputEl) {
              const inputText = extractPreText(inputEl);
              const outputText = extractPreText(outputEl);
              
              examples.push({
                index: examples.length + 1,
                input: inputText,
                output: outputText
              });
            }
          }
        });
        
        // Extract difficulty
        let difficulty = 'Unknown';
        const titleText = titleEl.textContent.trim();
        const letter = titleText.match(/^([A-G])\./)?.[1];
        if (letter) {
          const difficultyMap = { 'A': 'Easy', 'B': 'Easy', 'C': 'Medium', 'D': 'Medium', 'E': 'Hard', 'F': 'Hard', 'G': 'Hard' };
          difficulty = difficultyMap[letter] || 'Medium';
        }
        
        // Extract tags
        let tags = '';
        const tagElements = document.querySelectorAll('.tag-box a, [class*="tag"]');
        if (tagElements.length > 0) {
          tags = Array.from(tagElements)
            .map(el => el.textContent.trim())
            .filter(t => t.length > 0 && t.length < 30 && !t.match(/^\*?\d+$/))
            .slice(0, 5)
            .join(', ');
        }
        
        extractedData = {
          title: titleEl?.textContent?.trim() || '',
          description: description.trim().slice(0, 5000) || '',
          constraints: constraints.slice(0, 1000),
          difficulty: difficulty,
          tags: tags,
          inputFormat: inputFormat.slice(0, 1000),
          outputFormat: outputFormat.slice(0, 1000),
          examples: examples,
          examplesCount: examples.length,
          url: window.location.href
        };
        
      } else if (platform === 'leetcode') {
        // LeetCode extraction would go here (similar structure)
        console.log('⚠️ LeetCode extraction test not implemented in this script');
        console.log('💡 The extension will extract LeetCode problems automatically');
        return;
      } else if (platform === 'codechef') {
        // CodeChef extraction would go here
        console.log('⚠️ CodeChef extraction test not implemented in this script');
        console.log('💡 The extension will extract CodeChef problems automatically');
        return;
      }
      
      // Validate and report
      validateAndReport(extractedData);
      
    } catch (error) {
      console.error('❌ Test failed with error:', error);
      console.error(error.stack);
    }
  }
  
  // Validation and reporting
  function validateAndReport(data) {
    console.log('\n📊 EXTRACTION RESULTS:');
    console.log('='.repeat(60));
    
    const validation = {
      title: { value: data.title, valid: data.title && data.title.length > 0, required: true },
      description: { value: data.description, valid: data.description && data.description.length >= 100, required: true },
      difficulty: { value: data.difficulty, valid: data.difficulty !== 'Unknown', required: false },
      tags: { value: data.tags, valid: data.tags && data.tags.length > 0, required: false },
      inputFormat: { value: data.inputFormat, valid: data.inputFormat && data.inputFormat.length > 0, required: true },
      outputFormat: { value: data.outputFormat, valid: data.outputFormat && data.outputFormat.length > 0, required: true },
      examples: { value: data.examplesCount, valid: data.examplesCount > 0, required: true },
      constraints: { value: data.constraints, valid: data.constraints && data.constraints.length > 0, required: false }
    };
    
    // Display results
    Object.entries(validation).forEach(([field, check]) => {
      const status = check.valid ? '✅' : (check.required ? '❌' : '⚠️');
      const required = check.required ? '(required)' : '(optional)';
      
      if (field === 'description') {
        console.log(`${status} ${field.toUpperCase()} ${required}:`);
        console.log(`   Length: ${check.value.length} characters`);
        console.log(`   Preview: ${check.value.slice(0, 150)}${check.value.length > 150 ? '...' : ''}`);
      } else if (field === 'examples') {
        console.log(`${status} ${field.toUpperCase()} ${required}:`);
        console.log(`   Count: ${check.value}`);
        if (data.examples && data.examples.length > 0) {
          data.examples.forEach((ex, i) => {
            console.log(`   Example ${i + 1}:`);
            console.log(`     Input: ${ex.input.slice(0, 50)}${ex.input.length > 50 ? '...' : ''}`);
            console.log(`     Output: ${ex.output.slice(0, 50)}${ex.output.length > 50 ? '...' : ''}`);
          });
        }
      } else {
        const displayValue = typeof check.value === 'string' ? 
          (check.value.slice(0, 100) + (check.value.length > 100 ? '...' : '')) : 
          check.value;
        console.log(`${status} ${field.toUpperCase()} ${required}: ${displayValue || '(empty)'}`);
      }
    });
    
    // Calculate score
    const requiredFields = Object.entries(validation).filter(([_, check]) => check.required);
    const optionalFields = Object.entries(validation).filter(([_, check]) => !check.required);
    
    const requiredScore = requiredFields.filter(([_, check]) => check.valid).length;
    const optionalScore = optionalFields.filter(([_, check]) => check.valid).length;
    
    const totalRequired = requiredFields.length;
    const totalOptional = optionalFields.length;
    
    const score = (requiredScore / totalRequired) * 100;
    const optionalBonus = (optionalScore / totalOptional) * 10;
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 VALIDATION SCORE:');
    console.log(`   Required Fields: ${requiredScore}/${totalRequired} (${Math.round(score)}%)`);
    console.log(`   Optional Fields: ${optionalScore}/${totalOptional} (${Math.round(optionalBonus * 10)}%)`);
    console.log(`   Overall Score: ${Math.round(score + optionalBonus)}/100`);
    
    // Issues report
    const issues = Object.entries(validation)
      .filter(([_, check]) => !check.valid)
      .map(([field, _]) => field);
    
    if (issues.length > 0) {
      console.log('\n⚠️ ISSUES FOUND:');
      issues.forEach(issue => {
        const check = validation[issue];
        if (check.required) {
          console.log(`   ❌ ${issue}: Missing or invalid (REQUIRED)`);
        } else {
          console.log(`   ⚠️ ${issue}: Missing or invalid (optional)`);
        }
      });
    } else {
      console.log('\n✅ All fields extracted successfully!');
    }
    
    // Character limits check
    console.log('\n📏 CHARACTER LIMITS CHECK:');
    console.log(`   Description: ${data.description.length}/5000 ${data.description.length >= 5000 ? '⚠️ (at limit)' : '✅'}`);
    console.log(`   Input Format: ${data.inputFormat.length}/1000 ${data.inputFormat.length >= 1000 ? '⚠️ (at limit)' : '✅'}`);
    console.log(`   Output Format: ${data.outputFormat.length}/1000 ${data.outputFormat.length >= 1000 ? '⚠️ (at limit)' : '✅'}`);
    console.log(`   Constraints: ${data.constraints.length}/1000 ${data.constraints.length >= 1000 ? '⚠️ (at limit)' : '✅'}`);
    
    // Full data preview
    console.log('\n' + '='.repeat(60));
    console.log('📋 FULL EXTRACTED DATA:');
    console.log(JSON.stringify(data, null, 2));
    console.log('='.repeat(60));
  }
  
  // Run the test
  testExtraction();
  
})();
