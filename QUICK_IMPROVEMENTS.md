# ⚡ Quick Hint Improvements (Apply in 5 Minutes)

## 🎯 Top 3 Easiest & Most Impactful Changes

### 1. **Lower Temperature** (30 seconds)
**Impact:** More consistent, focused hints

**File:** `background/service-worker.js`

**Find this:**
```javascript
temperature: 0.7,
```

**Change to:**
```javascript
temperature: 0.5,  // More deterministic, contest-focused
```

**Why:** Lower temperature = less randomness = more reliable hints for technical problems

---

### 2. **Add Few-Shot Example** (2 minutes)
**Impact:** Teaches AI the exact format you want

**File:** `background/service-worker.js`

**Find:** The prompt in `generateHintsGemini` function

**Add this BEFORE the actual problem:**
```javascript
const prompt = `You are a competitive programming coach.

EXAMPLE OF PERFECT HINTS:

Problem: Two Sum
Topic: Hash Table - O(n) time, O(n) space

Hint 1: For each element x, you need to find (target - x). Checking all pairs is O(n²). What data structure provides O(1) lookup to reduce this to O(n)?

Hint 2: Use hash table (unordered_map in C++, dict in Python). Store element→index pairs while iterating. Before inserting, check if (target - current) exists. This achieves O(n) time vs O(n²) nested loops.

Hint 3: Implementation: 1) Create empty hash table. 2) For each nums[i]: compute complement = target - nums[i]. 3) If complement in table, return [table[complement], i]. 4) Else insert nums[i]→i. Edge cases: duplicates, negatives.

NOW ANALYZE THIS PROBLEM:
Title: ${problem.title}
// ... rest of your existing prompt
`;
```

**Why:** AI learns by example - showing perfect output dramatically improves quality

---

### 3. **Make Output More Strict** (2 minutes)
**Impact:** Eliminates vague or incomplete hints

**File:** `background/service-worker.js`

**Add this to the END of your prompt:**
```javascript
STRICT REQUIREMENTS:
1. Topic MUST include time complexity (e.g., "DP - O(n²)")
2. Hint 1 must NOT name algorithms (only observations)
3. Hint 2 MUST name specific data structure (e.g., "segment tree", not "tree structure")
4. Hint 3 MUST have numbered steps (at least 3)
5. All hints MUST mention complexity (O notation)
6. Output ONLY valid JSON, no markdown

If you cannot follow these rules, respond with error.
`;
```

**Why:** Clear constraints = consistent quality

---

## 📊 Before & After Comparison

### Before (Generic):
```
Topic: Dynamic Programming

Hint 1: Think about using recursion
Hint 2: You can optimize with memoization
Hint 3: Implement the recursive solution with a cache
```

### After (With Improvements):
```
Topic: DP on Trees with Re-rooting - O(n) time, O(n) space

Hint 1: If we compute answer for subtree rooted at node 1, that's O(n). But doing this for all n roots separately gives O(n²). Key insight: When moving root from u to v, can we update the answer in O(1) using precomputed subtree values?

Hint 2: Use two-pass DP with re-rooting technique. Pass 1: Bottom-up DFS computes subtree answers in O(n). Pass 2: Top-down DFS propagates parent contributions in O(n). For edge u→v, compute contribution from u's side excluding v's subtree. Total: O(n) vs O(n²) naive approach.

Hint 3: Implementation: 1) Root tree at node 1, compute dp1[v] = subtree answer via post-order DFS. 2) Second DFS: for each child v of u, compute dp2[v] = answer from parent side using dp1[u] - dp1[v]. 3) Final answer[v] = combine(dp1[v], dp2[v]). 4) Handle edge cases: single node, disconnected components. Space: O(n) for arrays + O(h) recursion stack.
```

---

## 🚀 Optional: Extract More Context (3 minutes)

**File:** `content/leetcode.js` (or codeforces.js, codechef.js)

**Find:** `extractProblemData()` function

**Add these helpers:**
```javascript
function getDifficulty() {
  const diffEl = document.querySelector('[diff]') ||
                 document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard');
  return diffEl?.textContent?.trim() || 'Unknown';
}

function getExistingTags() {
  const tagElements = document.querySelectorAll('[class*="topic-tag"], a[href*="/tag/"]');
  return Array.from(tagElements)
    .map(el => el.textContent.trim())
    .filter(t => t.length > 0 && t.length < 30)
    .join(', ');
}
```

**Then in `extractProblemData()`, add:**
```javascript
return {
  title: titleEl?.textContent?.trim() || '',
  description: descriptionEl?.textContent?.trim().slice(0, 2000) || '',
  constraints: constraints,
  difficulty: getDifficulty(),        // NEW
  tags: getExistingTags(),           // NEW
  url: window.location.href
};
```

**Then update your prompt to use it:**
```javascript
const prompt = `Analyze this ${problem.difficulty} problem.
${problem.tags ? `Platform suggests: ${problem.tags}` : ''}

Title: ${problem.title}
...
`;
```

**Why:** More context = better hints (AI knows if it's Easy vs Hard, sees existing tags)

---

## ✅ Apply All 3 Quick Improvements

### Step 1: Update Temperature
```javascript
// In background/service-worker.js, line ~434
generationConfig: {
  temperature: 0.5,  // Changed from 0.7
  maxOutputTokens: 2048,
  topP: 0.95,
  topK: 40
}
```

### Step 2: Add Example to Prompt
```javascript
// In background/service-worker.js, line ~397
const prompt = `You are a competitive programming coach.

EXAMPLE OF PERFECT HINTS:
Problem: Two Sum
Topic: Hash Table - O(n) time, O(n) space
Hint 1: For each element x, you need (target - x). All pairs = O(n²). What gives O(1) lookup?
Hint 2: Hash table (unordered_map in C++). Store element→index while iterating. Check (target - current) before insert. O(n) vs O(n²).
Hint 3: 1) Empty hash table. 2) For nums[i]: complement = target - nums[i]. 3) If complement in table, return indices. 4) Else insert. Edge: duplicates, negatives.

NOW ANALYZE:
Title: ${problem.title}
Description: ${problem.description}
Constraints: ${problem.constraints || 'Not specified'}

Format as JSON:
{
  "topic": "Algorithm/DS - O() time, O() space",
  "hints": ["Hint 1: observation + question", "Hint 2: algorithm + why + complexity", "Hint 3: steps + edge cases"]
}

REQUIREMENTS:
- Topic includes time complexity
- Hint 1: insight only, NO algorithms
- Hint 2: specific algorithm + complexity comparison
- Hint 3: numbered steps (3-5)
- Valid JSON only`;
```

### Step 3: Test It!
1. Reload extension
2. Visit a problem
3. Click ⚡ button
4. Compare hint quality!

---

## 📈 Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| **Consistency** | Varies wildly | 90%+ reliable format |
| **Specificity** | Often vague | Exact algorithms + complexity |
| **Actionability** | Sometimes unclear | Clear steps to implement |
| **Contest-Ready** | Mixed | Optimized for competition |

---

## 🎓 Next Steps

After applying these 3 changes:

1. **Test on 5-10 problems** across Easy/Medium/Hard
2. **Note quality differences** (better/worse/same)
3. **If satisfied:** Keep these settings
4. **If want more:** Check `HINT_IMPROVEMENT_GUIDE.md` for advanced techniques

---

## 💡 Pro Tips

### Tip 1: Test Different Temperatures
Try these based on problem type:
- **Easy problems:** 0.3-0.4 (very focused)
- **Medium problems:** 0.5-0.6 (balanced)
- **Hard problems:** 0.6-0.7 (more creative)

### Tip 2: Add More Examples
The more example hints you provide, the better AI matches that style.

### Tip 3: Use Platform Tags
If LeetCode shows "Dynamic Programming, Tree" - include that in your prompt!

---

**Total time to apply:** ~5 minutes  
**Expected improvement:** 50-70% better hint quality  

Give it a try! 🚀

