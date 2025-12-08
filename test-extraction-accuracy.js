/**
 * LC Helper - Problem Extraction Accuracy Tester
 * 
 * HOW TO USE:
 * 1. Navigate to a problem page on LeetCode, Codeforces, or CodeChef
 * 2. Open DevTools Console (F12 or Cmd+Option+I)
 * 3. The extraction results are automatically logged when the FAB appears
 * 4. Compare the logged output with what's on the page
 * 
 * Or manually test by copying this script into the console after loading the extension.
 * 
 * Expected output format:
 * ============================================================
 * LC Helper - Extracted Problem Data (LeetCode/Codeforces/CodeChef)
 * ============================================================
 * 📌 Title: Two Sum
 * 📊 Difficulty: Easy
 * 🏷️ Tags: Array, Hash Table
 * ------------------------------------------------------------
 * 📝 Description (first 500 chars):
 * Given an array of integers nums and an integer target...
 * ------------------------------------------------------------
 * 📋 Sample Test Cases (2 found):
 *   Example 1:
 *     Input: nums = [2,7,11,15], target = 9
 *     Output: [0,1]
 *   Example 2:
 *     Input: nums = [3,2,4], target = 6
 *     Output: [1,2]
 * ------------------------------------------------------------
 * 🔗 URL: https://leetcode.com/problems/two-sum/
 * ============================================================
 */

// Accuracy checklist - manually verify these fields:
const ACCURACY_CHECKLIST = `
╔══════════════════════════════════════════════════════════════╗
║           LC HELPER - EXTRACTION ACCURACY CHECKLIST          ║
╠══════════════════════════════════════════════════════════════╣
║ Field              │ Check                                   ║
╠════════════════════╪═════════════════════════════════════════╣
║ Title              │ □ Matches page title exactly            ║
║ Difficulty         │ □ Correct (Easy/Medium/Hard)            ║
║ Tags               │ □ All visible tags captured             ║
║ Description        │ □ Problem statement complete            ║
║ Constraints        │ □ All constraints captured              ║
║ Input Format       │ □ Input format description correct      ║
║ Output Format      │ □ Output format description correct     ║
║ Sample Inputs      │ □ All sample inputs captured            ║
║ Sample Outputs     │ □ All expected outputs captured         ║
║ Explanations       │ □ Example explanations included         ║
╚══════════════════════════════════════════════════════════════╝

SCORING:
- 10/10: All fields correct and complete
- 8-9/10: Minor issues (truncation, missing optional fields)
- 6-7/10: Some important fields missing
- <6/10: Major extraction issues
`;

// Test URLs for manual testing
const TEST_PROBLEMS = {
  leetcode: [
    'https://leetcode.com/problems/two-sum/',           // Easy - basic
    'https://leetcode.com/problems/add-two-numbers/',   // Medium - with images
    'https://leetcode.com/problems/median-of-two-sorted-arrays/', // Hard
    'https://leetcode.com/problems/binary-tree-inorder-traversal/', // With tree diagrams
  ],
  codeforces: [
    'https://codeforces.com/problemset/problem/1/A',    // Theatre Square
    'https://codeforces.com/problemset/problem/4/A',    // Watermelon
    'https://codeforces.com/contest/1950/problem/A',    // Recent contest
  ],
  codechef: [
    'https://www.codechef.com/problems/START01',        // Starter problem
    'https://www.codechef.com/problems/FLOW001',        // Basic
  ]
};

// Function to generate accuracy report (run in console)
function generateAccuracyReport(extractedData, actualData) {
  const fields = ['title', 'difficulty', 'tags', 'description', 'constraints', 'examples'];
  const report = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    platform: detectPlatform(),
    scores: {},
    totalScore: 0,
    issues: []
  };
  
  fields.forEach(field => {
    const extracted = extractedData[field] || '';
    const actual = actualData[field] || '';
    
    if (!extracted) {
      report.scores[field] = 0;
      report.issues.push(`${field}: Not extracted`);
    } else if (field === 'title' && extracted.toLowerCase() !== actual.toLowerCase()) {
      report.scores[field] = 0.5;
      report.issues.push(`${field}: Partial match`);
    } else {
      report.scores[field] = 1;
    }
  });
  
  report.totalScore = Object.values(report.scores).reduce((a, b) => a + b, 0);
  report.maxScore = fields.length;
  report.percentage = Math.round((report.totalScore / report.maxScore) * 100);
  
  return report;
}

function detectPlatform() {
  const url = window.location.href;
  if (url.includes('leetcode.com')) return 'leetcode';
  if (url.includes('codeforces.com')) return 'codeforces';
  if (url.includes('codechef.com')) return 'codechef';
  return 'unknown';
}

// Print checklist when script loads
console.log(ACCURACY_CHECKLIST);
console.log('\n📋 Test Problems for each platform:');
console.log(JSON.stringify(TEST_PROBLEMS, null, 2));
console.log('\n✅ Now navigate to a problem page and check the console for extraction results!');
console.log('The extraction happens automatically when the LC Helper FAB button appears.\n');
