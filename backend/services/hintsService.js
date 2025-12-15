// Hints generation service with difficulty-based model selection
// Using built-in fetch (Node.js 18+)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const DEFAULT_PROVIDER = process.env.DEFAULT_AI_PROVIDER || 'gemini';

/**
 * Select AI model based on problem difficulty
 * Easy problems → Gemini 2.0 Flash (cheap)
 * Medium/Hard problems → Claude 3.5 Sonnet (better quality)
 * @param {string} difficulty - Problem difficulty (Easy, Medium, Hard)
 * @returns {string} - Selected provider ('gemini' or 'claude')
 */
function selectModelByDifficulty(difficulty) {
  if (!difficulty) {
    // Default to Claude if difficulty unknown (safer for quality)
    return 'claude';
  }
  
  const difficultyLower = difficulty.toLowerCase().trim();
  
  // Use Gemini Flash for Easy problems (much cheaper)
  if (difficultyLower === 'easy' || difficultyLower === 'beginner') {
    return 'gemini';
  }
  
  // Use Claude Sonnet for Medium and Hard problems (better quality)
  return 'claude';
}

export async function generateHints(problem, platform = 'leetcode', isExplanation = false) {
  // Select model based on difficulty for cost optimization
  const selectedProvider = selectModelByDifficulty(problem.difficulty);
  
  // Route to appropriate provider
  if (selectedProvider === 'gemini' && GEMINI_API_KEY) {
    return await generateHintsGemini(problem, platform, isExplanation);
  } else if (selectedProvider === 'claude' && CLAUDE_API_KEY) {
    return await generateHintsClaude(problem, platform, isExplanation);
  } else if (selectedProvider === 'gemini' && !GEMINI_API_KEY && CLAUDE_API_KEY) {
    // Fallback: If Gemini not configured but Claude is, use Claude
    console.warn('Gemini API key not configured, falling back to Claude');
    return await generateHintsClaude(problem, platform, isExplanation);
  } else if (selectedProvider === 'claude' && !CLAUDE_API_KEY && GEMINI_API_KEY) {
    // Fallback: If Claude not configured but Gemini is, use Gemini
    console.warn('Claude API key not configured, falling back to Gemini');
    return await generateHintsGemini(problem, platform, isExplanation);
  } else if (OPENAI_API_KEY) {
    // Final fallback to OpenAI if configured
    return await generateHintsOpenAI(problem, platform, isExplanation);
  } else {
    throw new Error('No AI provider configured. Please set GEMINI_API_KEY, CLAUDE_API_KEY, or OPENAI_API_KEY in environment variables.');
  }
}

async function generateHintsGemini(problem, platform, isExplanation = false) {
  try {
    const prompt = isExplanation 
      ? buildExplanationPrompt(problem, platform)
      : buildHintsPrompt(problem, platform);

    // Build parts array - start with text prompt
    const parts = [{
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');
        
        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });
        
        console.log('Gemini: Including image data in request');
      } catch (imageError) {
        console.warn('Gemini: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
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

async function generateHintsClaude(problem, platform, isExplanation = false) {
  try {
    const prompt = isExplanation 
      ? buildExplanationPrompt(problem, platform)
      : buildHintsPrompt(problem, platform);

    // Build content array - start with text
    const content = [{
      type: 'text',
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');
        
        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data
          }
        });
        
        console.log('Claude: Including image data in request');
      } catch (imageError) {
        console.warn('Claude: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: await response.text() } }));
      throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response format from Claude API');
    }
    
    const text = data.content[0].text;

    if (isExplanation) {
      return parseExplanationResponse(text);
    } else {
      return parseHintsResponse(text);
    }
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Failed to generate hints: ${error.message}`);
  }
}

async function generateHintsOpenAI(problem, platform, isExplanation = false) {
  try {
    const prompt = isExplanation 
      ? buildExplanationPrompt(problem, platform)
      : buildHintsPrompt(problem, platform);

    // Build user message content - start with text
    const userContent = [{
      type: 'text',
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        // OpenAI Vision API expects base64 data URL directly or as image_url
        // We'll use the data URL format directly
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData // OpenAI accepts data URLs directly
          }
        });
        
        console.log('OpenAI: Including image data in request');
      } catch (imageError) {
        console.warn('OpenAI: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    // gpt-4o-mini supports vision (images), so we can use it for both text and image requests
    const model = 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert competitive programming assistant that provides helpful hints and explanations.'
          },
          {
            role: 'user',
            content: userContent
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
  let prompt = `You are an expert competitive programming assistant. Provide progressive hints for this problem.

Problem Title: ${problem.title}
Platform: ${platform}
Difficulty: ${problem.difficulty || 'Unknown'}`;

  // Add note about images if available
  if (problem.hasImages && problem.imageData) {
    prompt += `\n\nNote: This problem contains visual diagrams or graphs. Please analyze the provided image carefully when generating hints.`;
  }

  prompt += `\n\nProblem Description (HTML format with MathJax converted to LaTeX - parse the HTML structure to understand the problem statement, constraints, input/output format, and examples):
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

  return prompt;
}

function buildExplanationPrompt(problem, platform) {
  let prompt = `You are an expert competitive programming assistant. Explain this problem in simpler terms.

Problem Title: ${problem.title}
Platform: ${platform}
Difficulty: ${problem.difficulty || 'Unknown'}`;

  // Add note about images if available
  if (problem.hasImages && problem.imageData) {
    prompt += `\n\nNote: This problem contains visual diagrams or graphs. Please analyze the provided image carefully when explaining the problem.`;
  }

  prompt += `\n\nProblem Description (HTML format with MathJax converted to LaTeX - parse the HTML structure to understand the problem statement, constraints, input/output format, and examples):
${problem.description || 'Not provided'}

Provide a clear, beginner-friendly explanation that:
1. Explains what the problem is asking
2. Breaks down the key concepts
3. Provides examples
4. Suggests the approach

Format your response as JSON:
{
  "explanation": "...",
  "keyPoints": ["...", "..."],
  "examples": ["...", "..."],
  "approach": "..."
}`;

  return prompt;
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
    // First, try to parse the entire text as JSON (in case it's a quoted JSON string)
    let parsed = null;
    try {
      parsed = JSON.parse(text);
      // If parsing succeeds and we got a string, it might be a quoted JSON string
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          // If the inner parse fails, use the string as explanation
          return {
            explanation: parsed,
            keyPoints: [],
            examples: [],
            approach: ''
          };
        }
      }
      // If we got an object, return it (and normalize keyConcepts to keyPoints if needed)
      if (parsed && typeof parsed === 'object') {
        // Normalize keyConcepts to keyPoints for frontend compatibility
        if (parsed.keyConcepts && !parsed.keyPoints) {
          parsed.keyPoints = parsed.keyConcepts;
          delete parsed.keyConcepts;
        }
        return parsed;
      }
    } catch (e) {
      // If direct parse fails, try regex extraction
    }

    // Try to extract JSON using regex (handles cases where JSON is embedded in text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = jsonMatch[0];
      parsed = JSON.parse(extracted);
      
      // Handle case where parsed result is a string (quoted JSON)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          // If inner parse fails, use as explanation
          return {
            explanation: parsed,
            keyPoints: [],
            examples: [],
            approach: ''
          };
        }
      }
      
      if (parsed && typeof parsed === 'object') {
        // Normalize keyConcepts to keyPoints for frontend compatibility
        if (parsed.keyConcepts && !parsed.keyPoints) {
          parsed.keyPoints = parsed.keyConcepts;
          delete parsed.keyConcepts;
    }
        return parsed;
      }
    }
    
    // Fallback: return text as explanation
    return {
      explanation: text,
      keyPoints: [],
      examples: [],
      approach: ''
    };
  } catch (error) {
    console.error('Failed to parse explanation response:', error);
    return {
      explanation: text,
      keyPoints: [],
      examples: [],
      approach: ''
    };
  }
}

