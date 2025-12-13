// Hints generation service
// Using built-in fetch (Node.js 18+)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_PROVIDER = process.env.DEFAULT_AI_PROVIDER || 'gemini';

export async function generateHints(problem, platform = 'leetcode', isExplanation = false) {
  const provider = DEFAULT_PROVIDER;
  
  if (provider === 'gemini' && GEMINI_API_KEY) {
    return await generateHintsGemini(problem, platform, isExplanation);
  } else if (provider === 'openai' && OPENAI_API_KEY) {
    return await generateHintsOpenAI(problem, platform, isExplanation);
  } else {
    throw new Error('No AI provider configured. Please set OPENAI_API_KEY or GEMINI_API_KEY in environment variables.');
  }
}

async function generateHintsGemini(problem, platform, isExplanation = false) {
  try {
    const prompt = isExplanation 
      ? buildExplanationPrompt(problem, platform)
      : buildHintsPrompt(problem, platform);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    if (isExplanation) {
      return parseExplanationResponse(text);
    } else {
      return parseHintsResponse(text);
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Failed to generate hints: ${error.message}`);
  }
}

async function generateHintsOpenAI(problem, platform, isExplanation = false) {
  try {
    const prompt = isExplanation 
      ? buildExplanationPrompt(problem, platform)
      : buildHintsPrompt(problem, platform);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert competitive programming assistant that provides helpful hints and explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    if (isExplanation) {
      return parseExplanationResponse(text);
    } else {
      return parseHintsResponse(text);
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`Failed to generate hints: ${error.message}`);
  }
}

function buildHintsPrompt(problem, platform) {
  return `You are an expert competitive programming assistant. Provide progressive hints for this problem.

Problem Title: ${problem.title}
Platform: ${platform}
Difficulty: ${problem.difficulty || 'Unknown'}

Problem Description:
${problem.description || 'Not provided'}

Provide three levels of hints:
1. Gentle Push - A subtle nudge in the right direction
2. Stronger Nudge - More specific guidance
3. Almost There - Very close to the solution

Also provide:
- Topic classification (e.g., Array, Dynamic Programming, Graph, etc.)
- Time complexity analysis
- Space complexity analysis

Format your response as JSON:
{
  "hints": {
    "gentle": "...",
    "stronger": "...",
    "almost": "..."
  },
  "topic": "...",
  "timeComplexity": "...",
  "spaceComplexity": "..."
}`;
}

function buildExplanationPrompt(problem, platform) {
  return `You are an expert competitive programming assistant. Explain this problem in simpler terms.

Problem Title: ${problem.title}
Platform: ${platform}
Difficulty: ${problem.difficulty || 'Unknown'}

Problem Description:
${problem.description || 'Not provided'}

Provide a clear, beginner-friendly explanation that:
1. Explains what the problem is asking
2. Breaks down the key concepts
3. Provides examples
4. Suggests the approach

Format your response as JSON:
{
  "explanation": "...",
  "keyConcepts": ["...", "..."],
  "examples": ["...", "..."],
  "approach": "..."
}`;
}

function parseHintsResponse(text) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Fallback: return as plain text
    return {
      hints: {
        gentle: text,
        stronger: text,
        almost: text
      },
      topic: 'Unknown',
      timeComplexity: 'Unknown',
      spaceComplexity: 'Unknown'
    };
  } catch (error) {
    console.error('Failed to parse hints response:', error);
    return {
      hints: {
        gentle: text,
        stronger: text,
        almost: text
      },
      topic: 'Unknown',
      timeComplexity: 'Unknown',
      spaceComplexity: 'Unknown'
    };
  }
}

function parseExplanationResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      explanation: text,
      keyConcepts: [],
      examples: [],
      approach: ''
    };
  } catch (error) {
    console.error('Failed to parse explanation response:', error);
    return {
      explanation: text,
      keyConcepts: [],
      examples: [],
      approach: ''
    };
  }
}

