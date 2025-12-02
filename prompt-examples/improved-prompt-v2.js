// Improved Prompt Template - Ready to Use
// Drop this into background/service-worker.js

async function generateHintsGemini_V2(problem, apiKey) {
  try {
    // Extract additional context
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || 'None';
    
    const prompt = `You are a competitive programming expert providing contest-ready hints.

PROBLEM ANALYSIS:
Title: ${problem.title}
Difficulty: ${difficulty}
${existingTags !== 'None' ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}

Description: ${problem.description}

TASK: Generate optimal hints for a competitive programmer.

OUTPUT FORMAT (JSON only, no markdown):
{
  "topic": "<Algorithm/DS> - O() time, O() space",
  "hints": [
    "<Hint 1: Key observation>",
    "<Hint 2: Specific algorithm with why>",
    "<Hint 3: Implementation steps>"
  ]
}

HINT GUIDELINES:

Hint 1 - Key Insight (Gentle Push):
✓ Identify the critical property or pattern
✓ Compare naive vs optimal complexity
✓ Ask a guiding question
✗ Do NOT name algorithms yet
Example: "For each element, we need O(1) lookup of its complement. Array scan is O(n). What structure gives O(1) lookup?"

Hint 2 - Algorithm (Stronger Nudge):
✓ Name EXACT algorithm/data structure
✓ Explain WHY it's optimal for THIS problem
✓ Compare complexity: brute force → optimal
✓ Mention specific implementation (e.g., "unordered_map in C++")
Example: "Use hash table for O(1) lookups. Store element→index pairs while iterating. Check for complement before inserting. Time: O(n) vs O(n²) nested loops."

Hint 3 - Implementation (Almost There):
✓ List 3-5 numbered steps
✓ Include initialization, loop logic, return condition
✓ Mention edge cases
✓ Note optimization opportunities
✗ Do NOT provide actual code
Example: "1) Initialize hash table. 2) For i, num in enumerate(nums): a) If (target-num) in table, return indices. b) Store num→i. 3) Edge cases: duplicates, negative numbers."

EXAMPLES OF GOOD HINTS:

Problem: Two Sum
{
  "topic": "Hash Table - O(n) time, O(n) space",
  "hints": [
    "For each number x, you need to find (target - x). Checking all pairs is O(n²). What data structure allows O(1) existence checks to reduce this to O(n)?",
    "Use a hash table (unordered_map in C++, dict in Python). Store each number with its index as you iterate. Before inserting, check if (target - current_number) already exists. This single-pass approach achieves O(n) time with O(n) space, compared to O(n²) for nested loops.",
    "Implementation: 1) Create empty hash table number→index. 2) For each nums[i]: compute complement = target - nums[i]. 3) If complement in table, return [table[complement], i]. 4) Otherwise, insert nums[i]→i into table. 5) Edge cases: handle duplicate values, negative numbers, ensure i ≠ j."
  ]
}

Problem: Longest Increasing Subsequence
{
  "topic": "DP with Binary Search (Patience Sort) - O(n log n)",
  "hints": [
    "Standard DP with dp[i] = LIS ending at i gives O(n²). Key insight: For each length L, we only need to track the SMALLEST tail element among all LIS of length L. This monotonic property enables a faster search. What technique works on monotonic sequences?",
    "Use Patience Sorting with binary search. Maintain array 'tails' where tails[i] = smallest ending element of all LIS of length i+1. For each new element, binary search its position in tails and update. This optimizes the inner loop from O(n) to O(log n), achieving O(n log n) total vs O(n²) standard DP.",
    "Implementation: 1) Initialize empty tails array. 2) For each num in input: a) Binary search leftmost position where tails[pos] ≥ num (use lower_bound in C++, bisect_left in Python). b) If pos == len(tails), append num. c) Else, replace tails[pos] = num. 3) Return len(tails). Space: O(n). Edge case: empty array returns 0."
  ]
}

NOW ANALYZE THE PROBLEM ABOVE.
Requirements:
- Topic MUST include time complexity
- Hints MUST be progressive (don't give away solution in Hint 1)
- MUST use specific terminology (unordered_map, not "hash structure")
- MUST compare complexities (O(n log n) vs O(n²))
- Output ONLY valid JSON, no markdown formatting`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.5,  // Lower for more consistent, focused hints
          maxOutputTokens: 2048,
          topP: 0.9,
          topK: 40
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      return { error: data.error.message };
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'Failed to parse response' };
  } catch (error) {
    console.error('Error generating hints with Gemini:', error);
    return { error: error.message };
  }
}

// Optional: Extract additional context from problem page
function extractEnhancedProblemData() {
  // Standard extraction
  const titleEl = document.querySelector('[data-cy="question-title"]') || 
                  document.querySelector('.text-title-large');
  const descriptionEl = document.querySelector('[data-cy="question-content"]') ||
                        document.querySelector('.elfjS');
  
  // NEW: Extract difficulty
  let difficulty = 'Unknown';
  const difficultyEl = document.querySelector('[diff]') ||
                       document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard');
  if (difficultyEl) {
    difficulty = difficultyEl.textContent.trim();
  }
  
  // NEW: Extract existing tags
  let tags = '';
  const tagElements = document.querySelectorAll('[class*="topic-tag"], .tag, a[href*="/tag/"]');
  if (tagElements.length > 0) {
    tags = Array.from(tagElements)
      .map(el => el.textContent.trim())
      .filter(t => t.length > 0)
      .join(', ');
  }
  
  // Constraints
  let constraints = '';
  const constraintsHeader = Array.from(document.querySelectorAll('strong, b'))
    .find(el => el.textContent.toLowerCase().includes('constraints'));
  if (constraintsHeader) {
    const constraintsList = constraintsHeader.closest('p')?.nextElementSibling;
    if (constraintsList) {
      constraints = constraintsList.textContent;
    }
  }
  
  return {
    title: titleEl?.textContent?.trim() || '',
    description: descriptionEl?.textContent?.trim().slice(0, 2000) || '',
    constraints: constraints,
    difficulty: difficulty,
    tags: tags,
    url: window.location.href
  };
}

module.exports = { generateHintsGemini_V2, extractEnhancedProblemData };

