# Problem Capture Test Guide

## Quick Test Instructions

### Method 1: Using the Test Script (Recommended)

1. **Navigate to a Codeforces problem page:**

   - Example: `https://codeforces.com/problemset/problem/2172/G`
   - Or any other Codeforces problem

2. **Open Browser DevTools:**

   - Press `F12` (Windows/Linux) or `Cmd+Option+I` (Mac)
   - Go to the **Console** tab

3. **Load the test script:**

   - Copy the entire contents of `test-problem-capture.js`
   - Paste into the console
   - Press Enter

4. **Review the results:**
   - The script will show extraction results
   - Validation scores
   - Any issues found
   - Full extracted data

### Method 2: Using Extension Console Logs

1. **Navigate to a problem page**
2. **Open DevTools Console**
3. **Look for automatic extraction logs:**
   ```
   ============================================================
   LC Helper - Extracted Problem Data (Codeforces)
   ============================================================
   📌 Title: ...
   📝 Description (XXXX chars): ...
   ```

## What to Check

### ✅ Required Fields (Must be present):

- **Title**: Should match the problem title exactly
- **Description**: Should be complete (not truncated at 500 chars)
- **Input Format**: Should include input specifications
- **Output Format**: Should include output specifications
- **Examples**: At least one sample test case should be captured

### ⚠️ Optional Fields (Nice to have):

- **Difficulty**: Should be detected (Easy/Medium/Hard)
- **Tags**: Should capture problem tags
- **Constraints**: Should include time/memory limits

### 📏 Character Limits:

- Description: Up to 5000 characters (was 2000)
- Input Format: Up to 1000 characters (was 500)
- Output Format: Up to 1000 characters (was 300)
- Constraints: Up to 1000 characters (was 500)

## Test Cases

### Codeforces Problems to Test:

1. **Simple Problem:**

   - `https://codeforces.com/problemset/problem/1/A` (Theatre Square)
   - Should have short description, clear I/O

2. **Medium Problem:**

   - `https://codeforces.com/problemset/problem/2172/G` (Circles Are Far)
   - Should have longer description with definitions

3. **Problem with Images:**
   - Any problem with diagrams/graphs
   - Should handle CORS errors gracefully

## Expected Improvements

After the recent changes, you should see:

1. ✅ **Full description** (not truncated at 500 chars)
2. ✅ **Better formatting** (preserved line breaks, paragraphs)
3. ✅ **Complete sections** (Input, Output, Note sections)
4. ✅ **No CORS errors** (external images handled gracefully)
5. ✅ **Better structure** (properly separated sections)

## Troubleshooting

### If extraction fails:

- Check if you're on a valid problem page
- Verify the page has fully loaded
- Check console for errors
- Try refreshing the page

### If description is truncated:

- Check the character count in console
- Verify it's not hitting the 5000 char limit
- Check if fallback extraction is being used

### If examples are missing:

- Verify the page has sample test cases
- Check if `.sample-test` elements exist
- Look for `.input pre` and `.output pre` elements

## Reporting Issues

If you find issues, note:

1. Problem URL
2. Platform (Codeforces/LeetCode/CodeChef)
3. What was extracted vs. what should be extracted
4. Console errors (if any)
5. Screenshot of the extraction results
