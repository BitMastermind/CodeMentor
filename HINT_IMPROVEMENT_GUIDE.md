# 🎯 How to Improve Hint Quality

## 🚀 Quick Wins (Easy to Implement)

### 1. **Adjust Temperature** (Controls Creativity)

Current: `temperature: 0.7`

**Lower temperature (0.3-0.5)** = More focused, consistent hints

```javascript
generationConfig: {
  temperature: 0.4,  // More deterministic
  maxOutputTokens: 2048,
}
```

**Higher temperature (0.8-0.9)** = More creative, varied approaches

```javascript
generationConfig: {
  temperature: 0.85,  // More creative
  maxOutputTokens: 2048,
}
```

**Recommendation:** Start with 0.5 for competitive programming

---

### 2. **Add Few-Shot Examples** (Teach by Example)

Add example problem + ideal hints to the prompt:

```javascript
const promptWithExamples = `You are a competitive programming coach.

EXAMPLE OF IDEAL HINTS:

Problem: Two Sum
Topic: Hash Table - O(n) time, O(n) space

Hint 1: For each number x, you need to find if (target - x) exists. 
Checking all pairs takes O(n²). Can you check existence faster? 
What data structure offers O(1) lookup?

Hint 2: Use a hash table (unordered_map in C++) to achieve O(n) time. 
Store each number with its index as you iterate. Before storing, 
check if (target - current) already exists. This gives you the pair 
in a single pass.

Hint 3: Implementation: 1) Create empty hash table. 2) For each number 
at index i: a) complement = target - numbers[i], b) If complement in 
hash table, return [hash[complement], i], c) Store numbers[i] → i 
in hash table. Time: O(n), Space: O(n).

NOW ANALYZE THIS PROBLEM:
[Your actual problem here...]
`;
```

---

### 3. **Extract More Context** (Better Problem Understanding)

Currently extracting: title, description, constraints

**Add more context:**

```javascript
function extractProblemData() {
  // ... existing code ...

  return {
    title: titleEl?.textContent?.trim() || "",
    description: descriptionEl?.textContent?.trim().slice(0, 2000) || "",
    constraints: constraints,
    url: window.location.href,

    // NEW: Add these
    difficulty: getDifficulty(), // Easy/Medium/Hard
    tags: getExistingTags(), // Topics shown by platform
    testCases: getExampleTests(), // Example inputs/outputs
    companyTags: getCompanyTags(), // Which companies asked this
  };
}

function getDifficulty() {
  // LeetCode: Look for difficulty badge
  const diffEl =
    document.querySelector("[diff]") ||
    document.querySelector(
      ".text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard"
    );
  return diffEl?.textContent || "Unknown";
}

function getExistingTags() {
  // Get topic tags shown on the page
  const tagElements = document.querySelectorAll('[class*="tag"], .topic-tag');
  return Array.from(tagElements)
    .map((el) => el.textContent)
    .join(", ");
}
```

---

### 4. **Multi-Pass Generation** (Generate + Refine)

Instead of one API call, make two:

**Pass 1:** Generate initial analysis

```javascript
async function generateHintsMultiPass(problem, apiKey) {
  // Step 1: Analyze the problem
  const analysisPrompt = `Analyze this problem and identify:
1. Core algorithmic pattern
2. Key insights needed
3. Optimal time/space complexity
4. Common pitfalls

Problem: ${problem.title}
Description: ${problem.description}`;

  const analysis = await callGemini(analysisPrompt, apiKey);

  // Step 2: Generate hints based on analysis
  const hintsPrompt = `Based on this analysis:
${analysis}

Generate 3 progressive hints following our format...`;

  return await callGemini(hintsPrompt, apiKey);
}
```

---

## 🎨 Advanced Improvements

### 5. **Difficulty-Adaptive Prompts**

Different hint styles for different difficulties:

```javascript
function getPromptForDifficulty(problem) {
  const basePart = `Analyze this ${problem.difficulty} problem...`;

  if (problem.difficulty === "Easy") {
    return (
      basePart +
      `
    Focus on:
    - Clear, beginner-friendly explanations
    - Step-by-step breakdowns
    - Common beginner mistakes to avoid
    `
    );
  } else if (problem.difficulty === "Hard") {
    return (
      basePart +
      `
    Focus on:
    - Advanced algorithmic techniques
    - Optimization strategies
    - Multiple approaches (brute force → optimal)
    - Edge cases and corner cases
    `
    );
  }
  // ... Medium logic
}
```

---

### 6. **Structured Output** (JSON Schema)

Force consistent, structured responses:

```javascript
// For Gemini 1.5+ with structured output
body: JSON.stringify({
  contents: [
    {
      parts: [{ text: prompt }],
    },
  ],
  generationConfig: {
    temperature: 0.5,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Exact topic with complexity",
        },
        complexity: {
          type: "object",
          properties: {
            time: { type: "string" },
            space: { type: "string" },
          },
        },
        hints: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 3,
        },
        relatedConcepts: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
});
```

---

### 7. **Context Window Optimization**

Prioritize important information:

```javascript
function buildOptimalContext(problem) {
  // Calculate token budget (approx)
  const maxInputTokens = 1000; // Leave room for response

  let context = `Title: ${problem.title}\n\n`;

  // Essential: Constraints (helps determine complexity)
  if (problem.constraints) {
    context += `Constraints: ${problem.constraints}\n\n`;
  }

  // Core: Description (trim if too long)
  const descLimit = maxInputTokens - context.length - 200;
  context += `Description: ${problem.description.slice(0, descLimit)}\n\n`;

  // Bonus: Test cases (if space allows)
  if (problem.testCases && context.length < maxInputTokens - 200) {
    context += `Examples: ${problem.testCases}\n`;
  }

  return context;
}
```

---

### 8. **Hint Quality Scoring** (Self-Evaluation)

Add a quality check step:

```javascript
async function generateWithQualityCheck(problem, apiKey) {
  const hints = await generateHints(problem, apiKey);

  // Ask AI to evaluate its own hints
  const evaluationPrompt = `Rate these hints on a scale of 1-10:
  
Hints: ${JSON.stringify(hints)}

Evaluation criteria:
- Does Hint 1 provide a key insight without giving away the solution?
- Does Hint 2 suggest specific algorithm/data structure?
- Does Hint 3 outline implementation steps?
- Are complexity analyses accurate?
- Are hints progressive (each more specific)?

If score < 7, regenerate with improvements.`;

  const score = await evaluateHints(evaluationPrompt, apiKey);

  if (score < 7) {
    // Regenerate with feedback
    return await generateHints(problem, apiKey, {
      previousHints: hints,
      improvementNeeded: true,
    });
  }

  return hints;
}
```

---

### 9. **Topic-Specific Prompts**

Specialize prompts based on detected topic:

```javascript
const topicPrompts = {
  "Dynamic Programming": `
    For DP problems, ensure hints:
    1. Identify the state definition
    2. Explain the recurrence relation
    3. Mention optimization (tabulation vs memoization)
  `,

  Graph: `
    For graph problems, ensure hints:
    1. Clarify graph representation (adjacency list/matrix)
    2. Suggest traversal method (BFS/DFS/Dijkstra)
    3. Mention space complexity of graph storage
  `,

  "Binary Search": `
    For binary search problems, ensure hints:
    1. Identify the search space
    2. Explain the invariant to maintain
    3. Clarify boundary conditions (left/right pointers)
  `,
};

function enhancePromptWithTopic(basePrompt, detectedTopic) {
  const enhancement = topicPrompts[detectedTopic] || "";
  return basePrompt + "\n\n" + enhancement;
}
```

---

### 10. **User Feedback Loop**

Learn from user interactions:

```javascript
// Add thumbs up/down buttons
function showHints(data) {
  // ... existing code ...

  body.innerHTML += `
    <div class="feedback-section">
      <p>Were these hints helpful?</p>
      <button class="feedback-btn" data-rating="up">👍 Yes</button>
      <button class="feedback-btn" data-rating="down">👎 No</button>
    </div>
  `;

  body.querySelectorAll(".feedback-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rating = btn.dataset.rating;
      await logFeedback(problem.url, data, rating);

      if (rating === "down") {
        // Offer to regenerate
        if (confirm("Would you like to try regenerating the hints?")) {
          loadHints(true); // Force refresh
        }
      }
    });
  });
}
```

---

## 🧪 Experimental: Hybrid Approach

### Chain Multiple AI Calls

```javascript
async function generateHybridHints(problem, apiKey) {
  // Step 1: Fast model for topic classification
  const topic = await classifyProblem(problem, "gemini-1.5-flash-8b"); // Faster model

  // Step 2: Smart model for hint generation
  problem.detectedTopic = topic;
  const hints = await generateHints(problem, "gemini-2.0-flash"); // Better model

  // Step 3: Validate complexity claims
  const validation = await validateComplexity(hints, "gemini-1.5-flash-8b");

  return { ...hints, validated: validation };
}
```

---

## 📊 Prompt Engineering Best Practices

### Current Prompt Issues & Fixes

**Issue 1: Too Verbose Instructions**

```javascript
// BAD: Long-winded
"You are an expert competitive programming coach with deep expertise...";

// GOOD: Concise
"You are a competitive programming coach. Provide optimal, contest-ready hints.";
```

**Issue 2: Vague Requirements**

```javascript
// BAD: Vague
"Provide hints that guide the solver"

// GOOD: Specific
"Hint 1: State the KEY INSIGHT in 1-2 sentences
Hint 2: Name the EXACT algorithm/data structure with O() complexity
Hint 3: List 3-5 implementation steps, no code"
```

**Issue 3: No Output Format Examples**

```javascript
// GOOD: Show exact format
`Format EXACTLY like this:

{
  "topic": "Two Pointers - O(n)",
  "hints": [
    "Insight: [observation about problem property]",
    "Algorithm: Use [specific technique] because [reason]. Complexity: O(...)",
    "Steps: 1) [step], 2) [step], 3) [step]. Edge cases: [cases]"
  ]
}

Do NOT deviate from this format.`;
```

---

## 🎯 Recommended Implementation Order

### Phase 1: Quick Wins (Do First)

1. ✅ Adjust temperature to 0.5
2. ✅ Add 1-2 few-shot examples
3. ✅ Extract difficulty + existing tags
4. ✅ Make prompt more concise + specific

### Phase 2: Structural Improvements

5. ✅ Implement structured output (JSON schema)
6. ✅ Add topic-specific prompt enhancements
7. ✅ Optimize context window

### Phase 3: Advanced Features

8. ✅ Multi-pass generation for hard problems
9. ✅ User feedback collection
10. ✅ Hint quality self-evaluation

---

## 💡 Example: Improved Prompt (Drop-in Replacement)

Here's an improved prompt you can use immediately:

```javascript
const improvedPrompt = `You are a competitive programming expert. Analyze this problem and provide optimal hints.

PROBLEM:
Title: ${problem.title}
Difficulty: ${problem.difficulty || "Unknown"}
Constraints: ${problem.constraints || "Not specified"}
Description: ${problem.description}

YOUR TASK:
1. Identify the EXACT topic with time complexity (e.g., "DP on Trees - O(n)", "Binary Search - O(log n)")
2. Generate 3 progressive hints:

HINT 1 FORMAT (Key Insight):
- State the critical observation in 2 sentences max
- Ask a guiding question
- DO NOT mention algorithms yet

HINT 2 FORMAT (Algorithm):
- Name the SPECIFIC algorithm/data structure
- Explain WHY it's optimal (compare to brute force)
- State time & space complexity

HINT 3 FORMAT (Implementation):
- List 3-5 numbered implementation steps
- Mention key optimizations
- Note edge cases
- DO NOT provide actual code

EXAMPLE OUTPUT:
{
  "topic": "Hash Table - O(n) time, O(n) space",
  "hints": [
    "Key insight: For each element x, you need to check if (target - x) exists. Linear search gives O(n²). What data structure provides O(1) lookup to reduce this to O(n)?",
    "Algorithm: Use a hash table (unordered_map in C++, dict in Python). As you iterate, store each number with its index. Before storing, check if (target - current) exists in the table. This achieves O(n) time with O(n) space, much better than O(n²) brute force.",
    "Implementation: 1) Create empty hash table. 2) For each number at index i: compute complement = target - nums[i]. 3) If complement in table, return [table[complement], i]. 4) Else, add nums[i] → i to table. Edge cases: duplicate numbers, negative numbers, zero."
  ]
}

Respond ONLY with valid JSON. Be specific, concise, and competition-focused.`;
```

---

## 📈 Measuring Improvement

### Metrics to Track:

1. **User satisfaction** - Thumbs up/down ratio
2. **API cost** - Tokens per hint (lower with concise prompts)
3. **Response time** - Faster with lower temperature
4. **Hint clarity** - Manual evaluation of 10-20 samples
5. **Actionability** - Can user implement from hints?

### A/B Testing:

```javascript
// Randomly test different prompts
const promptVariant = Math.random() < 0.5 ? "promptA" : "promptB";
const hints = await generateHints(problem, promptVariant);
logExperiment(problem.url, promptVariant, hints);
```

---

Would you like me to implement any of these improvements for you? The easiest wins are:

1. Temperature adjustment
2. Better prompt with examples
3. Extract difficulty/tags

Let me know which you'd like to try first!
